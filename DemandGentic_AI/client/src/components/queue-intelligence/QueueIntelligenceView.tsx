import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Brain, BarChart3, Layers, List, Loader2, Settings2, Zap, Activity } from "lucide-react";
import { ScoreOverviewPanel } from "./ScoreOverviewPanel";
import { SegmentAnalysisPanel } from "./SegmentAnalysisPanel";
import { ContactScoresTable } from "./ContactScoresTable";
import { LiveStatsPanel, type LiveStatsData } from "./LiveStatsPanel";
import { QueueIntelligenceConfig } from "@/components/campaigns/queue-intelligence-config";
import type { ScoreOverview, SegmentAnalysis, ScoreResult } from "./types";

interface Props {
  campaignId: string;
}

export function QueueIntelligenceView({ campaignId }: Props) {
  const [activeTab, setActiveTab] = useState("live-stats");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueQaParameters, setQueueQaParameters] = useState({});
  const { toast } = useToast();

  const { data: campaign } = useQuery({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (campaign?.qaParameters && typeof campaign.qaParameters === "object") {
      setQueueQaParameters(campaign.qaParameters);
    }
  }, [campaign?.qaParameters]);

  // Overview data
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["/api/queue-intelligence", campaignId, "overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/overview`);
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Segment data
  const { data: segments, isLoading: segmentsLoading } = useQuery({
    queryKey: ["/api/queue-intelligence", campaignId, "segment-analysis"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/segment-analysis`);
      return res.json();
    },
    enabled: !!campaignId && activeTab === "segments",
  });

  // Live stats data
  const { data: liveStats, isLoading: liveStatsLoading, error: liveStatsError } = useQuery({
    queryKey: ["/api/queue-intelligence", campaignId, "live-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/live-stats`);
      return res.json();
    },
    enabled: !!campaignId && activeTab === "live-stats",
    refetchInterval: activeTab === "live-stats" ? 30000 : false, // Auto-refresh every 30s when tab is active
    retry: 1,
  });

  // Score mutation
  const scoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/queue-intelligence/${campaignId}/score`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Queue Scored",
        description: `Scored ${data.scored} contacts (avg: ${data.avgScore}) in ${data.duration}ms`,
      });
      // Invalidate all queue intelligence queries
      queryClient.invalidateQueries({ queryKey: ["/api/queue-intelligence", campaignId] });
    },
    onError: (error: any) => {
      toast({
        title: "Scoring Failed",
        description: error.message || "Failed to score queue",
        variant: "destructive",
      });
    },
  });

  const saveQueueConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaignId}/qa-parameters`, {
        qaParameters: queueQaParameters,
        clientSubmissionConfig: campaign?.clientSubmissionConfig ?? null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Queue settings saved",
        description: "Queue intelligence rules were updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/queue-intelligence", campaignId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "Could not update queue intelligence settings.",
        variant: "destructive",
      });
    },
  });

  const openSettings = () => {
    setQueueQaParameters(campaign?.qaParameters && typeof campaign.qaParameters === "object" ? campaign.qaParameters : {});
    setSettingsOpen(true);
  };

  const handleSaveSettings = async (rescoreAfterSave: boolean) => {
    try {
      await saveQueueConfigMutation.mutateAsync();
      if (rescoreAfterSave) {
        await scoreMutation.mutateAsync();
      }
      setSettingsOpen(false);
    } catch {
      // Error handled by mutation callbacks
    }
  };

  const hasScores = overview && overview.totalScored > 0;

  return (
    
      {/* Header */}
      
        
          
          
            Queue Intelligence
            
              AI-powered contact prioritization based on industry, topic, account fit, role, and historical data
            
          
        
        
          {overview?.scoredAt && (
            
              Last scored: {new Date(overview.scoredAt).toLocaleString()}
            
          )}
          
            
            Queue Settings
          
           scoreMutation.mutate()}
            disabled={scoreMutation.isPending}
            size="sm"
          >
            {scoreMutation.isPending ? (
              <>
                
                Scoring...
              
            ) : (
              <>
                
                Score Queue
              
            )}
          
        
      

      {/* Tabs — Live Stats always available; score-dependent tabs show when scored */}
      
        
          
            
            Live Stats
          
          {hasScores && (
            <>
              
                
                Overview
              
              
                
                Segments
              
              
                
                Contact Scores
                
                  {overview?.totalScored || 0}
                
              
            
          )}
        

        
          {liveStatsLoading ? (
            
              
            
          ) : liveStatsError ? (
            
              
              Could not load live stats
              
                {(liveStatsError as any)?.message || "The queue may not have any contacts yet, or the endpoint is unavailable. Try syncing or setting the queue first."}
              
            
          ) : liveStats ? (
            
          ) : (
            
              
              No Queue Data
              
                Queue contacts into this campaign first, then live stats will appear here showing country distribution, phone status, priority breakdown, and next-in-line contacts.
              
            
          )}
        

        {hasScores && (
          <>
            
              {overviewLoading ? (
                
                  
                
              ) : overview ? (
                
              ) : null}
            

            
              {segmentsLoading ? (
                
                  
                
              ) : segments ? (
                
              ) : null}
            

            
              
            
          
        )}
      

      
        
          
            Queue Intelligence Settings
            
              Update priority rules, problem/solution keywords, and scoring weights for this campaign.
            
          

          
            
          

          
             setSettingsOpen(false)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
            >
              Cancel
            
             handleSaveSettings(false)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
              data-testid="button-save-queue-settings"
            >
              {saveQueueConfigMutation.isPending ? (
                <>
                  
                  Saving...
                
              ) : (
                "Save Settings"
              )}
            
             handleSaveSettings(true)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
              data-testid="button-save-rescore-queue-settings"
            >
              {saveQueueConfigMutation.isPending || scoreMutation.isPending ? (
                <>
                  
                  Saving & Scoring...
                
              ) : (
                "Save & Re-score"
              )}
            
          
        
      
    
  );
}