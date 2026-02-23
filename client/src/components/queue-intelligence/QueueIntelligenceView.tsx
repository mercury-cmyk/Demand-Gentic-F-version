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
  const [queueQaParameters, setQueueQaParameters] = useState<any>({});
  const { toast } = useToast();

  const { data: campaign } = useQuery<any>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  useEffect(() => {
    if (campaign?.qaParameters && typeof campaign.qaParameters === "object") {
      setQueueQaParameters(campaign.qaParameters);
    }
  }, [campaign?.qaParameters]);

  // Overview data
  const { data: overview, isLoading: overviewLoading } = useQuery<ScoreOverview>({
    queryKey: ["/api/queue-intelligence", campaignId, "overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/overview`);
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Segment data
  const { data: segments, isLoading: segmentsLoading } = useQuery<SegmentAnalysis>({
    queryKey: ["/api/queue-intelligence", campaignId, "segment-analysis"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/segment-analysis`);
      return res.json();
    },
    enabled: !!campaignId && activeTab === "segments",
  });

  // Live stats data
  const { data: liveStats, isLoading: liveStatsLoading } = useQuery<LiveStatsData>({
    queryKey: ["/api/queue-intelligence", campaignId, "live-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/queue-intelligence/${campaignId}/live-stats`);
      return res.json();
    },
    enabled: !!campaignId && activeTab === "live-stats",
    refetchInterval: activeTab === "live-stats" ? 30000 : false, // Auto-refresh every 30s when tab is active
  });

  // Score mutation
  const scoreMutation = useMutation<ScoreResult>({
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-base font-semibold">Queue Intelligence</h3>
            <p className="text-xs text-muted-foreground">
              AI-powered contact prioritization based on industry, topic, account fit, role, and historical data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {overview?.scoredAt && (
            <span className="text-xs text-muted-foreground">
              Last scored: {new Date(overview.scoredAt).toLocaleString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={openSettings}
            data-testid="button-open-queue-settings"
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Queue Settings
          </Button>
          <Button
            onClick={() => scoreMutation.mutate()}
            disabled={scoreMutation.isPending}
            size="sm"
          >
            {scoreMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Scoring...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1" />
                Score Queue
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs — Live Stats always available; score-dependent tabs show when scored */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="live-stats" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Live Stats
          </TabsTrigger>
          {hasScores && (
            <>
              <TabsTrigger value="overview" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="segments" className="gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Segments
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5">
                <List className="h-3.5 w-3.5" />
                Contact Scores
                <Badge variant="secondary" className="ml-1 text-xs">
                  {overview?.totalScored || 0}
                </Badge>
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="live-stats" className="mt-4">
          {liveStatsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : liveStats ? (
            <LiveStatsPanel data={liveStats} />
          ) : null}
        </TabsContent>

        {hasScores && (
          <>
            <TabsContent value="overview" className="mt-4">
              {overviewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : overview ? (
                <ScoreOverviewPanel data={overview} />
              ) : null}
            </TabsContent>

            <TabsContent value="segments" className="mt-4">
              {segmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : segments ? (
                <SegmentAnalysisPanel data={segments} />
              ) : null}
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <ContactScoresTable campaignId={campaignId} />
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Queue Intelligence Settings</DialogTitle>
            <DialogDescription>
              Update priority rules, problem/solution keywords, and scoring weights for this campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2 overflow-y-auto max-h-[68vh]">
            <QueueIntelligenceConfig
              qaParameters={queueQaParameters}
              onChange={setQueueQaParameters}
              campaignContext={{
                campaignObjective: campaign?.campaignObjective,
                productServiceInfo: campaign?.productServiceInfo,
                targetAudienceDescription: campaign?.targetAudienceDescription,
                successCriteria: campaign?.successCriteria,
                talkingPoints: campaign?.talkingPoints,
              }}
            />
          </div>

          <DialogFooter className="px-6 pb-6 gap-2">
            <Button
              variant="outline"
              onClick={() => setSettingsOpen(false)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSaveSettings(false)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
              data-testid="button-save-queue-settings"
            >
              {saveQueueConfigMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
            <Button
              onClick={() => handleSaveSettings(true)}
              disabled={saveQueueConfigMutation.isPending || scoreMutation.isPending}
              data-testid="button-save-rescore-queue-settings"
            >
              {saveQueueConfigMutation.isPending || scoreMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving & Scoring...
                </>
              ) : (
                "Save & Re-score"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
