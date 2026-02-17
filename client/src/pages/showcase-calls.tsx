import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  Trophy,
  Sparkles,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  Pause,
  BarChart3,
  Heart,
  MessageSquare,
  Shield,
  Zap,
  Target,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ShowcaseCallCard, type ShowcaseCall } from "@/components/showcase-calls/showcase-call-card";
import { PinShowcaseDialog } from "@/components/showcase-calls/pin-showcase-dialog";
import { AudioPlayerEnhanced } from "@/components/call-intelligence";
import { TranscriptDisplay } from "@/components/call-intelligence";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// Types
// ============================================================================

interface ShowcaseStats {
  total: number;
  averages: {
    overall: number;
    engagement: number;
    clarity: number;
    empathy: number;
    objectionHandling: number;
    flowCompliance: number;
  };
  byCategory: Array<{ category: string; count: number }>;
  topCampaigns: Array<{ campaignId: string; campaignName: string; count: number; avgScore: number }>;
  conversationPool?: {
    totalConversations: number;
    avgScore: number;
    highPerformers: number;
  };
}

interface ShowcaseListResponse {
  calls: ShowcaseCall[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface AutoDetectResponse {
  candidates: (ShowcaseCall & { suggestedCategory: string })[];
  threshold: number;
}

interface CallDetails {
  callSessionId: string;
  overallScore: number | null;
  engagementScore: number | null;
  clarityScore: number | null;
  empathyScore: number | null;
  objectionHandlingScore: number | null;
  qualificationScore: number | null;
  closingScore: number | null;
  flowComplianceScore: number | null;
  campaignAlignmentScore: number | null;
  sentiment: string | null;
  engagementLevel: string | null;
  assignedDisposition: string | null;
  contactName: string | null;
  contactJobTitle: string | null;
  accountName: string | null;
  campaignName: string | null;
  fullTranscript: string | null;
  playbackUrl: string | null;
  hasRecording: boolean;
  durationSec: number | null;
  startedAt: string | null;
  showcaseCategory: string | null;
  showcaseNotes: string | null;
  agentPerformanceScore: number;
  issues: any[] | null;
  recommendations: any[] | null;
  [key: string]: any;
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "objection_handling", label: "Objection Handling" },
  { value: "professional_close", label: "Professional Close" },
  { value: "engagement_mastery", label: "Engagement Mastery" },
  { value: "difficult_situation", label: "Difficult Situation" },
  { value: "perfect_flow", label: "Perfect Flow" },
  { value: "empathetic_response", label: "Empathetic Response" },
];

const CATEGORY_ICONS: Record<string, any> = {
  objection_handling: Shield,
  professional_close: Target,
  engagement_mastery: Zap,
  difficult_situation: MessageSquare,
  perfect_flow: BarChart3,
  empathetic_response: Heart,
};
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// ============================================================================
// Main Page Component
// ============================================================================

export default function ShowcaseCallsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [tab, setTab] = useState("showcased");
  const [page, setPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minScore, setMinScore] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Pin dialog state
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<ShowcaseCall | null>(null);

  // Detail panel state
  const [detailCallId, setDetailCallId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Build query params
  const buildParams = () => {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", "50");
    if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
    if (selectedCategory !== "all") params.append("category", selectedCategory);
    if (minScore) params.append("minScore", minScore);
    if (startDate) params.append("startDate", new Date(startDate).toISOString());
    if (endDate) params.append("endDate", new Date(endDate).toISOString());
    return params.toString();
  };

  // ---- Queries ----

  const { data: stats, isLoading: statsLoading } = useQuery<ShowcaseStats>({
    queryKey: ["/api/showcase-calls/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/showcase-calls/stats");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: SIX_HOURS_MS,
    refetchIntervalInBackground: true,
  });

  const { data: showcasedData, isLoading: showcasedLoading } = useQuery<ShowcaseListResponse>({
    queryKey: ["/api/showcase-calls", page, selectedCampaign, selectedCategory, minScore, startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/showcase-calls?${buildParams()}`);
      return res.json();
    },
    enabled: tab === "showcased",
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: SIX_HOURS_MS,
    refetchIntervalInBackground: true,
  });

  const { data: discoverData, isLoading: discoverLoading } = useQuery<AutoDetectResponse>({
    queryKey: ["/api/showcase-calls/auto-detect", selectedCampaign, minScore],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== "all") params.append("campaignId", selectedCampaign);
      if (minScore) params.append("threshold", minScore);
      params.append("limit", "30");
      const res = await apiRequest("GET", `/api/showcase-calls/auto-detect?${params.toString()}`);
      return res.json();
    },
    enabled: tab === "discover",
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: SIX_HOURS_MS,
    refetchIntervalInBackground: true,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<CallDetails>({
    queryKey: ["/api/showcase-calls/details", detailCallId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/showcase-calls/${detailCallId}/details`);
      return res.json();
    },
    enabled: !!detailCallId,
  });

  // Campaigns list for filter
  const { data: campaignsList } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/campaigns-list"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns");
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // ---- Mutations ----

  const pinMutation = useMutation({
    mutationFn: async ({ callSessionId, category, notes }: { callSessionId: string; category: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/showcase-calls/${callSessionId}/pin`, { category, notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call pinned as showcase" });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
      setPinDialogOpen(false);
      setPinTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to pin call", variant: "destructive" });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      const res = await apiRequest("DELETE", `/api/showcase-calls/${callSessionId}/pin`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Showcase call unpinned" });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
    },
    onError: () => {
      toast({ title: "Failed to unpin call", variant: "destructive" });
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (callSessionId: string) => {
      // Fast path: backfill Telnyx recording ID first when possible.
      try {
        const resyncRes = await apiRequest("POST", `/api/recordings/${callSessionId}/resync`);
        const resyncData = await resyncRes.json();
        if (resyncData?.success) {
          return { mode: "resync", ...resyncData };
        }
      } catch {
        // Fallback to full retry-sync below
      }

      const retryRes = await apiRequest("POST", `/api/recordings/${callSessionId}/retry-sync`, {
        transcribe: false,
      });
      const retryData = await retryRes.json();
      return { mode: "retry-sync", ...retryData };
    },
    onSuccess: (data: any) => {
      toast({
        title: "Recording sync requested",
        description:
          data?.mode === "resync"
            ? "Recording link refreshed. Retrying playback now."
            : "Trying to fetch a fresh recording copy now.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/details", detailCallId] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/showcase-calls/auto-detect"] });
    },
    onError: (error: any) => {
      toast({
        title: "Recording sync failed",
        description: error?.message || "Could not fetch a fresh recording right now.",
        variant: "destructive",
      });
    },
  });

  // ---- Handlers ----

  const handlePin = (call: ShowcaseCall) => {
    setPinTarget(call);
    setPinDialogOpen(true);
  };

  const handleConfirmPin = (category: string, notes: string) => {
    if (!pinTarget) return;
    pinMutation.mutate({ callSessionId: pinTarget.callSessionId, category, notes });
  };

  const handleUnpin = (callSessionId: string) => {
    unpinMutation.mutate(callSessionId);
  };

  const handleRetrySync = () => {
    if (!detailCallId) return;
    retrySyncMutation.mutate(detailCallId);
  };

  const pagination = showcasedData?.pagination;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              Showcase Calls
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Meaningful, professional conversations with recording playback, clear transcript, detected issues, and recommendations. Refreshes every 6 hours.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Stats bar */}
        {stats && !statsLoading && (
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">{stats.total}</span>
              <span className="text-xs text-muted-foreground">showcased</span>
            </div>
            {stats.total > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">{stats.averages.overall}</span>
                <span className="text-xs text-muted-foreground">avg score</span>
              </div>
            )}
            {stats.conversationPool && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">{stats.conversationPool.totalConversations}</span>
                  <span className="text-xs text-muted-foreground">real conversations</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">{stats.conversationPool.highPerformers}</span>
                  <span className="text-xs text-muted-foreground">high performers</span>
                </div>
              </>
            )}
            {stats.byCategory.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.category] || Sparkles;
              return (
                <Badge key={cat.category} variant="secondary" className="text-xs">
                  <Icon className="h-3 w-3 mr-1" />
                  {cat.category?.replace(/_/g, " ")} ({cat.count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <Select value={selectedCampaign} onValueChange={(v) => { setSelectedCampaign(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {campaignsList?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              placeholder="Min score"
              value={minScore}
              onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
              className="w-[100px]"
            />

            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-[140px]"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="showcased">
              <Trophy className="h-4 w-4 mr-2" />
              Showcased ({stats?.total ?? 0})
            </TabsTrigger>
            <TabsTrigger value="discover">
              <Sparkles className="h-4 w-4 mr-2" />
              Discover
            </TabsTrigger>
          </TabsList>

          {/* ---- Showcased Tab ---- */}
          <TabsContent value="showcased" className="mt-4">
            {showcasedLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !showcasedData?.calls.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No showcase calls yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Go to the Discover tab to find and pin your top meaningful conversations.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {showcasedData.calls.map((call) => (
                  <ShowcaseCallCard
                    key={call.id}
                    call={call}
                    isPinned
                    onUnpin={handleUnpin}
                    onViewDetails={setDetailCallId}
                  />
                ))}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ---- Discover Tab ---- */}
          <TabsContent value="discover" className="mt-4">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Auto-detected calls with strong conversation quality, handling precision, and longer call duration.
                These calls demonstrate meaningful professional handling regardless of outcome.
              </p>
            </div>

            {discoverLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !discoverData?.candidates.length ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No candidates found</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    No calls meet the performance threshold yet. Lower the minimum score or wait for more analyzed calls.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Found {discoverData.candidates.length} candidates (threshold: {discoverData.threshold}+)
                </p>
                {discoverData.candidates.map((call) => (
                  <ShowcaseCallCard
                    key={call.id}
                    call={call}
                    isPinned={false}
                    onPin={handlePin}
                    onViewDetails={setDetailCallId}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Pin Dialog */}
      <PinShowcaseDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        contactName={pinTarget?.contactName}
        suggestedCategory={pinTarget?.suggestedCategory}
        onConfirm={handleConfirmPin}
        isLoading={pinMutation.isPending}
      />

      {/* Detail Side Panel */}
      <Sheet open={!!detailCallId} onOpenChange={(open) => { if (!open) setDetailCallId(null); }}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : detailData ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Call Details
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Performance Score */}
                <div className="flex items-center gap-4">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl ${
                      detailData.agentPerformanceScore >= 80
                        ? "bg-green-500"
                        : detailData.agentPerformanceScore >= 60
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  >
                    {detailData.agentPerformanceScore}
                  </div>
                  <div>
                    <p className="font-semibold">{detailData.contactName || "Unknown"}</p>
                    {detailData.contactJobTitle && (
                      <p className="text-sm text-muted-foreground">{detailData.contactJobTitle}</p>
                    )}
                    {detailData.accountName && (
                      <p className="text-sm text-muted-foreground">{detailData.accountName}</p>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-2">
                  {detailData.assignedDisposition && (
                    <Badge variant="secondary">
                      {detailData.assignedDisposition.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {detailData.sentiment && (
                    <Badge
                      variant="outline"
                      className={
                        detailData.sentiment === "positive"
                          ? "bg-green-50 text-green-700"
                          : detailData.sentiment === "negative"
                          ? "bg-red-50 text-red-700"
                          : ""
                      }
                    >
                      {detailData.sentiment}
                    </Badge>
                  )}
                  {detailData.campaignName && (
                    <Badge variant="outline">{detailData.campaignName}</Badge>
                  )}
                </div>

                {/* Dimension Scores */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quality Dimensions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { label: "Engagement", value: detailData.engagementScore },
                      { label: "Clarity", value: detailData.clarityScore },
                      { label: "Empathy", value: detailData.empathyScore },
                      { label: "Objection Handling", value: detailData.objectionHandlingScore },
                      { label: "Flow Compliance", value: detailData.flowComplianceScore },
                      { label: "Qualification", value: detailData.qualificationScore },
                      { label: "Closing", value: detailData.closingScore },
                      { label: "Campaign Alignment", value: detailData.campaignAlignmentScore },
                    ].map((d) => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-[120px]">{d.label}</span>
                        <div className="flex-1">
                          <Progress
                            value={d.value ?? 0}
                            className="h-2"
                          />
                        </div>
                        <span
                          className={`text-xs font-medium w-8 text-right ${
                            (d.value ?? 0) >= 80
                              ? "text-green-600"
                              : (d.value ?? 0) >= 60
                              ? "text-yellow-600"
                              : "text-red-500"
                          }`}
                        >
                          {d.value ?? "-"}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Recording Player */}
                {detailData.playbackUrl && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Recording</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <AudioPlayerEnhanced
                        recordingId={detailData.callSessionId}
                        // Intentionally use the generic recordings stream resolver path
                        // (/api/recordings/:id/stream) which is token-optional and already
                        // hardened for cached URL refresh + multi-source fallback.
                        recordingUrl={null}
                        onRetrySync={handleRetrySync}
                        isRetrying={retrySyncMutation.isPending}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Transcript */}
                {detailData.fullTranscript && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Transcript</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[400px] overflow-y-auto">
                        <TranscriptDisplay transcript={detailData.fullTranscript} />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detected Issues */}
                {!!detailData.issues?.length && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Detected Issues</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {detailData.issues.map((issue: any, idx: number) => (
                        <div key={`issue-${idx}`} className="rounded-md border p-2">
                          <p className="text-sm font-medium">
                            {issue?.type || issue?.category || `Issue ${idx + 1}`}
                          </p>
                          {issue?.severity && (
                            <p className="text-xs text-muted-foreground capitalize">
                              Severity: {String(issue.severity)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {issue?.description || issue?.evidence || JSON.stringify(issue)}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {!!detailData.recommendations?.length && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {detailData.recommendations.map((rec: any, idx: number) => (
                        <div key={`rec-${idx}`} className="rounded-md border p-2">
                          <p className="text-sm font-medium">
                            {rec?.category || rec?.title || `Recommendation ${idx + 1}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {rec?.suggestedChange || rec?.description || rec?.expectedImpact || JSON.stringify(rec)}
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Showcase Notes */}
                {detailData.showcaseNotes && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Showcase Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm italic">"{detailData.showcaseNotes}"</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-muted-foreground">
              Call details not found
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

