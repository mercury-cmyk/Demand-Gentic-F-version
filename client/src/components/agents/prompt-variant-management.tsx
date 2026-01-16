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
    name: "The Problem Solver",
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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
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
    <div className="space-y-6">
      {/* Variant Generation Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Multiple Variants
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Prompt Variants</DialogTitle>
            <DialogDescription>
              Create multiple prompts using different perspectives to find the best approach
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Goal</label>
              <input
                type="text"
                placeholder="What should this agent accomplish?"
                value={generationContext.baseGoal}
                onChange={(e) =>
                  setGenerationContext({
                    ...generationContext,
                    baseGoal: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Tone</label>
              <input
                type="text"
                placeholder="e.g., professional, friendly, urgent"
                value={generationContext.tone}
                onChange={(e) =>
                  setGenerationContext({
                    ...generationContext,
                    tone: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Target Audience</label>
              <input
                type="text"
                placeholder="e.g., VP of Sales, C-suite, technical decision makers"
                value={generationContext.targetAudience}
                onChange={(e) =>
                  setGenerationContext({
                    ...generationContext,
                    targetAudience: e.target.value,
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => generateVariantsMutation.mutate()}
              disabled={
                !generationContext.baseGoal ||
                generateVariantsMutation.isPending
              }
              className="gap-2"
            >
              {generateVariantsMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Generate 7 Variants
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variants Tabs */}
      <Tabs defaultValue="variants" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="variants">Variants ({activeVariants.length})</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Variants Tab */}
        <TabsContent value="variants" className="space-y-4">
          {isLoadingVariants ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          ) : activeVariants.length === 0 ? (
            <Alert>
              <AlertTitle>No variants yet</AlertTitle>
              <AlertDescription>
                Generate variants to start testing different approaches
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3">
              {activeVariants.map((variant) => (
                <Card
                  key={variant.id}
                  className={`cursor-pointer transition ${
                    selectedVariantId === variant.id
                      ? "border-blue-500 bg-blue-50"
                      : "hover:border-gray-400"
                  }`}
                  onClick={() => {
                    setSelectedVariantId(variant.id);
                    onVariantSelected?.(variant);
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">
                            {variant.variantName}
                          </CardTitle>
                          {variant.isDefault && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3 fill-current" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <CardDescription>
                          {
                            PERSPECTIVES.find((p) => p.id === variant.perspective)
                              ?.description
                          }
                        </CardDescription>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1">
                        {!variant.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDefaultMutation.mutate(variant.id);
                            }}
                            title="Set as default"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteVariantMutation.mutate(variant.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Test Results */}
                  {variant.testResults && variant.testResults.testCount > 0 && (
                    <CardContent className="pb-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600">Tests:</span>
                          <span className="ml-2 font-semibold">
                            {variant.testResults.testCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Success:</span>
                          <span className="ml-2 font-semibold">
                            {variant.testResults.successRate.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Avg Duration:</span>
                          <span className="ml-2 font-semibold">
                            {variant.testResults.avgDuration.toFixed(0)}s
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Engagement:</span>
                          <span className="ml-2 font-semibold">
                            {variant.testResults.avgEngagementScore.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          {isLoadingComparison ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          ) : !comparisonData || comparisonData.length === 0 ? (
            <Alert>
              <AlertTitle>No test data yet</AlertTitle>
              <AlertDescription>
                Test variants in campaigns to see performance metrics
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {comparisonData.map((comparison: any, idx: number) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {comparison.variantName}
                      </CardTitle>
                      {idx === 0 && (
                        <Badge className="gap-1 bg-green-600">
                          <TrendingUp className="h-3 w-3" />
                          Best Performer
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600 text-xs">Tests</span>
                        <div className="font-bold">
                          {comparison.testCount}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Success Rate</span>
                        <div className="font-bold">
                          {comparison.successRate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Avg Duration</span>
                        <div className="font-bold">
                          {comparison.avgDuration.toFixed(0)}s
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600 text-xs">Engagement</span>
                        <div className="font-bold">
                          {comparison.avgEngagementScore.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Selected Variant Details */}
      {selectedVariantId && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-base">Preview: {variantsData?.find((v) => v.id === selectedVariantId)?.variantName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <label className="font-semibold text-gray-700">First Message:</label>
              <p className="mt-1 p-2 bg-white rounded border">
                {variantsData?.find((v) => v.id === selectedVariantId)?.firstMessage}
              </p>
            </div>
            <div>
              <label className="font-semibold text-gray-700">System Prompt (first 300 chars):</label>
              <p className="mt-1 p-2 bg-white rounded border text-xs overflow-hidden">
                {variantsData
                  ?.find((v) => v.id === selectedVariantId)
                  ?.systemPrompt.substring(0, 300)}
                ...
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PromptVariantManagement;
