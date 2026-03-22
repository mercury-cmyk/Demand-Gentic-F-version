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
  const [targetJobTitles, setTargetJobTitles] = useState([]);
  const [targetSeniorityLevels, setTargetSeniorityLevels] = useState([]);
  const [seniorityWeight, setSeniorityWeight] = useState(0.7);
  const [titleAlignmentWeight, setTitleAlignmentWeight] = useState(0.3);
  const [newTitleInput, setNewTitleInput] = useState("");

  // Fetch current priority config
  const { data, isLoading } = useQuery({
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
    mutationFn: async (config: Partial) => {
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
      
        
      
    );
  }

  return (
    
      
        
          
            
              Priority Configuration
              
                Configure how contacts are prioritized based on seniority and job title relevance
              
            
             recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
              data-testid="button-recalculate-scores"
            >
              {recalculateMutation.isPending ? (
                
              ) : (
                
              )}
              Recalculate All Scores
            
          
        
        
          {/* Target Job Titles */}
          
            Target Job Titles
            
              Specify job titles that are most relevant to this campaign. Contacts with matching titles will receive higher priority scores.
            
            
               setNewTitleInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTargetTitle()}
                data-testid="input-add-target-title"
              />
              
                
              
            
            
              {targetJobTitles.map((title) => (
                
                  {title}
                   removeTargetTitle(title)}
                    className="hover:bg-destructive/20 rounded-full"
                    data-testid={`button-remove-title-${title}`}
                  >
                    
                  
                
              ))}
              {targetJobTitles.length === 0 && (
                
                  No target titles specified (all titles will be scored equally)
                
              )}
            
          

          {/* Target Seniority Levels */}
          
            Target Seniority Levels
            
              Select the seniority levels most relevant to this campaign. Higher seniority levels are automatically weighted more.
            
            
              {SENIORITY_LEVELS.map((level) => (
                 toggleSeniorityLevel(level.value)}
                  data-testid={`badge-seniority-${level.value}`}
                >
                  {level.label}
                
              ))}
            
          

          {/* Weight Configuration */}
          
            Priority Score Weights
            
              Adjust how much emphasis to place on seniority vs. job title alignment when calculating priority scores.
            
            
            
              
                Seniority Weight
                
                  {(seniorityWeight * 100).toFixed(0)}%
                
              
              
            

            
              
                Title Alignment Weight
                
                  {(titleAlignmentWeight * 100).toFixed(0)}%
                
              
              
            

            
              Priority Score Formula:
              
                priority = ({(seniorityWeight * 100).toFixed(0)}% × seniority) + ({(titleAlignmentWeight * 100).toFixed(0)}% × title_alignment)
              
            
          

          {/* Save Button */}
          
            
              {updateConfigMutation.isPending ? (
                
              ) : (
                "Save Configuration"
              )}
            
          
        
      
    
  );
}