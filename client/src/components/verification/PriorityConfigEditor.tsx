import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, Plus, X, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PriorityConfig {
  targetJobTitles?: string[];
  targetSeniorityLevels?: string[];
  seniorityWeight?: number;
  titleAlignmentWeight?: number;
}

const SENIORITY_LEVELS = [
  { value: 'executive', label: 'Executive' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'ic', label: 'Individual Contributor' },
];

export function PriorityConfigEditor({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [targetJobTitles, setTargetJobTitles] = useState<string[]>([]);
  const [targetSeniorityLevels, setTargetSeniorityLevels] = useState<string[]>([]);
  const [seniorityWeight, setSeniorityWeight] = useState(0.7);
  const [titleAlignmentWeight, setTitleAlignmentWeight] = useState(0.3);
  const [newTitleInput, setNewTitleInput] = useState("");

  // Fetch current priority config
  const { data, isLoading } = useQuery<{
    id: string;
    name: string;
    priorityConfig: PriorityConfig;
  }>({
    queryKey: ['/api/verification-campaigns', campaignId, 'priority-config'],
  });

  // Initialize form from fetched data
  useEffect(() => {
    if (data?.priorityConfig) {
      setTargetJobTitles(data.priorityConfig.targetJobTitles || []);
      setTargetSeniorityLevels(data.priorityConfig.targetSeniorityLevels || []);
      setSeniorityWeight(data.priorityConfig.seniorityWeight || 0.7);
      setTitleAlignmentWeight(data.priorityConfig.titleAlignmentWeight || 0.3);
    }
  }, [data]);

  // Update priority config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (config: Partial<PriorityConfig>) => {
      return await apiRequest(
        `/api/verification-campaigns/${campaignId}/priority-config`,
        'PATCH',
        config
      );
    },
    onSuccess: () => {
      toast({ title: "Priority configuration updated successfully" });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/verification-campaigns', campaignId, 'priority-config'] 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update priority config", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Recalculate priority scores mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(
        `/api/verification-campaigns/${campaignId}/priority-config/recalculate`,
        'POST'
      );
    },
    onSuccess: () => {
      toast({ title: "Priority scores recalculated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to recalculate priority scores", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleSave = () => {
    updateConfigMutation.mutate({
      targetJobTitles,
      targetSeniorityLevels,
      seniorityWeight,
      titleAlignmentWeight,
    });
  };

  const addTargetTitle = () => {
    if (newTitleInput.trim() && !targetJobTitles.includes(newTitleInput.trim())) {
      setTargetJobTitles([...targetJobTitles, newTitleInput.trim()]);
      setNewTitleInput("");
    }
  };

  const removeTargetTitle = (title: string) => {
    setTargetJobTitles(targetJobTitles.filter(t => t !== title));
  };

  const toggleSeniorityLevel = (level: string) => {
    if (targetSeniorityLevels.includes(level)) {
      setTargetSeniorityLevels(targetSeniorityLevels.filter(l => l !== level));
    } else {
      setTargetSeniorityLevels([...targetSeniorityLevels, level]);
    }
  };

  const handleWeightChange = (value: number[]) => {
    const newSeniorityWeight = value[0];
    setSeniorityWeight(newSeniorityWeight);
    setTitleAlignmentWeight(1 - newSeniorityWeight);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Priority Configuration</CardTitle>
              <CardDescription>
                Configure how contacts are prioritized based on seniority and job title relevance
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
              data-testid="button-recalculate-scores"
            >
              {recalculateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Recalculate All Scores</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Job Titles */}
          <div className="space-y-2">
            <Label>Target Job Titles</Label>
            <p className="text-sm text-muted-foreground">
              Specify job titles that are most relevant to this campaign. Contacts with matching titles will receive higher priority scores.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Director of IT, CTO, VP Engineering..."
                value={newTitleInput}
                onChange={(e) => setNewTitleInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTargetTitle()}
                data-testid="input-add-target-title"
              />
              <Button
                onClick={addTargetTitle}
                variant="outline"
                data-testid="button-add-title"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {targetJobTitles.map((title) => (
                <Badge 
                  key={title}
                  variant="secondary"
                  className="gap-1"
                  data-testid={`badge-title-${title}`}
                >
                  {title}
                  <button
                    onClick={() => removeTargetTitle(title)}
                    className="hover:bg-destructive/20 rounded-full"
                    data-testid={`button-remove-title-${title}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {targetJobTitles.length === 0 && (
                <span className="text-sm text-muted-foreground italic">
                  No target titles specified (all titles will be scored equally)
                </span>
              )}
            </div>
          </div>

          {/* Target Seniority Levels */}
          <div className="space-y-2">
            <Label>Target Seniority Levels</Label>
            <p className="text-sm text-muted-foreground">
              Select the seniority levels most relevant to this campaign. Higher seniority levels are automatically weighted more.
            </p>
            <div className="flex flex-wrap gap-2">
              {SENIORITY_LEVELS.map((level) => (
                <Badge
                  key={level.value}
                  variant={targetSeniorityLevels.includes(level.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleSeniorityLevel(level.value)}
                  data-testid={`badge-seniority-${level.value}`}
                >
                  {level.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Weight Configuration */}
          <div className="space-y-4">
            <Label>Priority Score Weights</Label>
            <p className="text-sm text-muted-foreground">
              Adjust how much emphasis to place on seniority vs. job title alignment when calculating priority scores.
            </p>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Seniority Weight</span>
                <span className="text-muted-foreground">
                  {(seniorityWeight * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[seniorityWeight]}
                onValueChange={handleWeightChange}
                min={0}
                max={1}
                step={0.05}
                data-testid="slider-seniority-weight"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Title Alignment Weight</span>
                <span className="text-muted-foreground">
                  {(titleAlignmentWeight * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[titleAlignmentWeight]}
                disabled
                min={0}
                max={1}
                step={0.05}
              />
            </div>

            <div className="p-3 bg-muted rounded-md text-sm">
              <span className="font-medium">Priority Score Formula:</span>
              <div className="mt-1 font-mono text-xs">
                priority = ({(seniorityWeight * 100).toFixed(0)}% × seniority) + ({(titleAlignmentWeight * 100).toFixed(0)}% × title_alignment)
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
