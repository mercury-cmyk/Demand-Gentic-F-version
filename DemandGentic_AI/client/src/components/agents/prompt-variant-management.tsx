/**
 * Prompt Variant Management Panel
 * Manages creation, selection, and testing of different prompt variations
 */

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Sparkles,
  Plus,
  BarChart3,
  Copy,
  Check,
  Loader2,
  Trash2,
  Star,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PromptVariant {
  id: string;
  variantName: string;
  perspective: string;
  systemPrompt: string;
  firstMessage?: string;
  isActive: boolean;
  isDefault: boolean;
  testResults?: {
    testCount: number;
    successRate: number;
    avgDuration: number;
    avgEngagementScore: number;
  };
}

interface PromptVariantManagementProps {
  agentId: string;
  agentName?: string;
  onVariantSelected?: (variant: PromptVariant) => void;
}

const PERSPECTIVES = [
  {
    id: "consultative",
    name: "The Consultant",
    description: "Ask questions, diagnose needs first",
    icon: "💡",
  },
  {
    id: "direct_value",
    name: "The Closer",
    description: "Lead with ROI and benefits",
    icon: "🎯",
  },
  {
    id: "pain_point",
    name: "The Demand Problem Solver",
    description: "Address specific pain points",
    icon: "🔧",
  },
  {
    id: "social_proof",
    name: "The Credible Expert",
    description: "Lead with case studies and results",
    icon: "⭐",
  },
  {
    id: "educational",
    name: "The Educator",
    description: "Teach and inform first",
    icon: "📚",
  },
  {
    id: "urgent",
    name: "The Urgency Maker",
    description: "Create appropriate urgency",
    icon: "⚡",
  },
  {
    id: "relationship",
    name: "The Relationship Builder",
    description: "Focus on personal rapport",
    icon: "🤝",
  },
];

export function PromptVariantManagement({
  agentId,
  agentName = "Agent",
  onVariantSelected,
}: PromptVariantManagementProps) {
  const { toast } = useToast();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [generationContext, setGenerationContext] = useState({
    baseGoal: "",
    tone: "",
    targetAudience: "",
    talkingPoints: [] as string[],
    objections: [] as string[],
    successCriteria: [] as string[],
  });

  // Fetch variants
  const { data: variantsData, isLoading: isLoadingVariants } = useQuery({
    queryKey: [`/api/agents/${agentId}/variants`],
    queryFn: async () => {
      const variants = await apiRequest("GET", `/api/agents/${agentId}/variants`);
      const data = variants instanceof Response ? await variants.json() : variants;
      return Array.isArray(data) ? (data as unknown as PromptVariant[]) : ([] as PromptVariant[]);
    },
  });

  // Fetch variant comparison
  const { data: comparisonData, isLoading: isLoadingComparison } = useQuery({
    queryKey: [`/api/agents/${agentId}/variants/compare`],
    queryFn: async () => {
      const comparison = await apiRequest("GET", `/api/agents/${agentId}/variants/compare`);
      const data = comparison instanceof Response ? await comparison.json() : comparison;
      return Array.isArray(data) ? (data as unknown as any[]) : ([] as any[]);
    },
  });

  // Generate variants mutation
  const generateVariantsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/generate-variants`, {
        agentName,
        ...generationContext,
        autoCreate: true,
      });
      return res;
    },
    onSuccess: (data) => {
      const jsonData = data instanceof Response ? (data as unknown) : data;
      const variants = Array.isArray(jsonData) ? (jsonData as unknown as PromptVariant[]) : ((jsonData as any)?.variants || []);
      toast({
        title: "Variants Generated",
        description: `Created ${variants?.length || 0} new prompt variants`,
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/agents/${agentId}/variants`],
      });
      setShowGenerateDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate variants",
        variant: "destructive",
      });
    },
  });

  // Set default variant mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (variantId: string) => {
      await apiRequest(
        "PUT",
        `/api/agents/${agentId}/variants/${variantId}/default`,
        {}
      );
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Variant set as default",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/agents/${agentId}/variants`],
      });
    },
  });

  // Delete variant mutation
  const deleteVariantMutation = useMutation({
    mutationFn: async (variantId: string) => {
      await apiRequest("DELETE", `/api/variants/${variantId}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Variant deleted",
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/agents/${agentId}/variants`],
      });
    },
  });

  const defaultVariant = variantsData?.find((v) => v.isDefault);
  const activeVariants = variantsData?.filter((v) => v.isActive) || [];

  return (
    
      {/* Variant Generation Dialog */}
      
        
          
            
            Generate Multiple Variants
          
        
        
          
            Generate Prompt Variants
            
              Create multiple prompts using different perspectives to find the best approach
            
          

          
            
              Goal
              
                  setGenerationContext({
                    ...generationContext,
                    baseGoal: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            

            
              Tone
              
                  setGenerationContext({
                    ...generationContext,
                    tone: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            

            
              Target Audience
              
                  setGenerationContext({
                    ...generationContext,
                    targetAudience: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            
          

          
             setShowGenerateDialog(false)}
            >
              Cancel
            
             generateVariantsMutation.mutate()}
              disabled={
                !generationContext.baseGoal ||
                generateVariantsMutation.isPending
              }
              className="gap-2"
            >
              {generateVariantsMutation.isPending && (
                
              )}
              Generate 7 Variants
            
          
        
      

      {/* Variants Tabs */}
      
        
          Variants ({activeVariants.length})
          Performance
        

        {/* Variants Tab */}
        
          {isLoadingVariants ? (
            
              {[1, 2, 3].map((i) => (
                
              ))}
            
          ) : activeVariants.length === 0 ? (
            
              No variants yet
              
                Generate variants to start testing different approaches
              
            
          ) : (
            
              {activeVariants.map((variant) => (
                 {
                    setSelectedVariantId(variant.id);
                    onVariantSelected?.(variant);
                  }}
                >
                  
                    
                      
                        
                          
                            {variant.variantName}
                          
                          {variant.isDefault && (
                            
                              
                              Default
                            
                          )}
                        
                        
                          {
                            PERSPECTIVES.find((p) => p.id === variant.perspective)
                              ?.description
                          }
                        
                      

                      {/* Actions */}
                      
                        {!variant.isDefault && (
                           {
                              e.stopPropagation();
                              setDefaultMutation.mutate(variant.id);
                            }}
                            title="Set as default"
                          >
                            
                          
                        )}
                         {
                            e.stopPropagation();
                            deleteVariantMutation.mutate(variant.id);
                          }}
                          title="Delete"
                        >
                          
                        
                      
                    
                  

                  {/* Test Results */}
                  {variant.testResults && variant.testResults.testCount > 0 && (
                    
                      
                        
                          Tests:
                          
                            {variant.testResults.testCount}
                          
                        
                        
                          Success:
                          
                            {variant.testResults.successRate.toFixed(1)}%
                          
                        
                        
                          Avg Duration:
                          
                            {variant.testResults.avgDuration.toFixed(0)}s
                          
                        
                        
                          Engagement:
                          
                            {variant.testResults.avgEngagementScore.toFixed(2)}
                          
                        
                      
                    
                  )}
                
              ))}
            
          )}
        

        {/* Performance Tab */}
        
          {isLoadingComparison ? (
            
              {[1, 2, 3].map((i) => (
                
              ))}
            
          ) : !comparisonData || comparisonData.length === 0 ? (
            
              No test data yet
              
                Test variants in campaigns to see performance metrics
              
            
          ) : (
            
              {comparisonData.map((comparison: any, idx: number) => (
                
                  
                    
                      
                        {comparison.variantName}
                      
                      {idx === 0 && (
                        
                          
                          Best Performer
                        
                      )}
                    
                  
                  
                    
                      
                        Tests
                        
                          {comparison.testCount}
                        
                      
                      
                        Success Rate
                        
                          {comparison.successRate.toFixed(1)}%
                        
                      
                      
                        Avg Duration
                        
                          {comparison.avgDuration.toFixed(0)}s
                        
                      
                      
                        Engagement
                        
                          {comparison.avgEngagementScore.toFixed(2)}
                        
                      
                    
                  
                
              ))}
            
          )}
        
      

      {/* Selected Variant Details */}
      {selectedVariantId && (
        
          
            Preview: {variantsData?.find((v) => v.id === selectedVariantId)?.variantName}
          
          
            
              First Message:
              
                {variantsData?.find((v) => v.id === selectedVariantId)?.firstMessage}
              
            
            
              System Prompt (first 300 chars):
              
                {variantsData
                  ?.find((v) => v.id === selectedVariantId)
                  ?.systemPrompt.substring(0, 300)}
                ...
              
            
          
        
      )}
    
  );
}

export default PromptVariantManagement;