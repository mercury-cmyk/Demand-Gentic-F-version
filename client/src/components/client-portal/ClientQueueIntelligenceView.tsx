/**
 * Client Portal Queue Intelligence View
 *
 * Read-only version of admin QueueIntelligenceView.
 * Uses client portal auth (Bearer token) and routes through /api/client-portal/campaigns/:id/queue-intelligence/*.
 * No scoring, no settings — purely informational for clients.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Brain, BarChart3, Layers, List, Loader2, Activity } from "lucide-react";
import { ScoreOverviewPanel } from "@/components/queue-intelligence/ScoreOverviewPanel";
import { SegmentAnalysisPanel } from "@/components/queue-intelligence/SegmentAnalysisPanel";
import { LiveStatsPanel, type LiveStatsData } from "@/components/queue-intelligence/LiveStatsPanel";
import type { ScoreOverview, SegmentAnalysis, ContactScoresResponse, ScoreBreakdown } from "@/components/queue-intelligence/types";
import { SCORE_DIMENSIONS } from "@/components/queue-intelligence/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

const getToken = () => localStorage.getItem("clientPortalToken");

/** Authenticated fetch for client portal endpoints */
async function clientFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── Sub-Score Bars (inline — identical to admin version) ─────────────────────
function SubScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex gap-0.5 w-28 cursor-help">
            {SCORE_DIMENSIONS.map((dim) => (
              <div
                key={dim.key}
                className="h-4 rounded-sm"
                style={{
                  width: `${(breakdown[dim.key] / 200) * 100}%`,
                  backgroundColor: dim.color,
                  minWidth: "2px",
                }}
              />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            {SCORE_DIMENSIONS.map((dim) => (
              <div key={dim.key} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dim.color }} />
                <span>
                  {dim.label}: {breakdown[dim.key]}/200
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Client Contact Scores Table ──────────────────────────────────────────────
function ClientContactScoresTable({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("score");
  const [tierFilter, setTierFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<ContactScoresResponse>({
    queryKey: ["client-qi", campaignId, "contact-scores", page, sortBy, tierFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "25", sortBy });
      if (tierFilter !== "all") params.set("tier", tierFilter);
      return clientFetch<ContactScoresResponse>(
        `/api/client-portal/campaigns/${campaignId}/queue-intelligence/contact-scores?${params}`
      );
    },
    enabled: !!campaignId,
  });

  const sortOptions = [
    { value: "score", label: "AI Score" },
    { value: "industry", label: "Industry" },
    { value: "topic", label: "Topic" },
    { value: "accountFit", label: "Account Fit" },
    { value: "roleFit", label: "Role Fit" },
    { value: "historical", label: "Historical" },
    { value: "priority", label: "Final Priority" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Contact Scores</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tier:</span>
              <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1">Tier 1</SelectItem>
                  <SelectItem value="2">Tier 2</SelectItem>
                  <SelectItem value="3">Tier 3</SelectItem>
                  <SelectItem value="4">Tier 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : !data || data.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No scored contacts available yet.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-center">AI Score</TableHead>
                  <TableHead className="text-center">Sub-Scores</TableHead>
                  <TableHead className="text-center">Final Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contacts.map((contact) => (
                  <TableRow key={contact.queueId}>
                    <TableCell className="font-medium text-sm">{contact.contactName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{contact.accountName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{contact.industry || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">{contact.jobTitle || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={
                          contact.aiPriorityScore >= 800 ? "border-green-500 text-green-600"
                            : contact.aiPriorityScore >= 600 ? "border-blue-500 text-blue-600"
                            : contact.aiPriorityScore >= 400 ? "border-yellow-500 text-yellow-600"
                            : "border-red-500 text-red-600"
                        }
                      >
                        {contact.aiPriorityScore}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <SubScoreBars breakdown={contact.breakdown} />
                    </TableCell>
                    <TableCell className="text-center text-sm font-mono">{contact.finalPriority}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} contacts)
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  campaignId: string;
}

export function ClientQueueIntelligenceView({ campaignId }: Props) {
  const [activeTab, setActiveTab] = useState("live-stats");

  const basePath = `/api/client-portal/campaigns/${campaignId}/queue-intelligence`;

  // Overview
  const { data: overview, isLoading: overviewLoading } = useQuery<ScoreOverview>({
    queryKey: ["client-qi", campaignId, "overview"],
    queryFn: () => clientFetch<ScoreOverview>(`${basePath}/overview`),
    enabled: !!campaignId,
  });

  // Segments
  const { data: segments, isLoading: segmentsLoading } = useQuery<SegmentAnalysis>({
    queryKey: ["client-qi", campaignId, "segment-analysis"],
    queryFn: () => clientFetch<SegmentAnalysis>(`${basePath}/segment-analysis`),
    enabled: !!campaignId && activeTab === "segments",
  });

  // Live stats
  const {
    data: liveStats,
    isLoading: liveStatsLoading,
    error: liveStatsError,
  } = useQuery<LiveStatsData>({
    queryKey: ["client-qi", campaignId, "live-stats"],
    queryFn: () => clientFetch<LiveStatsData>(`${basePath}/live-stats`),
    enabled: !!campaignId && activeTab === "live-stats",
    refetchInterval: activeTab === "live-stats" ? 30000 : false,
    retry: 1,
  });

  const hasScores = overview && overview.totalScored > 0;

  return (
    <div className="space-y-4">
      {/* Header — read-only, no scoring or settings buttons */}
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
        {overview?.scoredAt && (
          <span className="text-xs text-muted-foreground">
            Last scored: {new Date(overview.scoredAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Tabs */}
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
          ) : liveStatsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium mb-1">Could not load live stats</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {(liveStatsError as any)?.message ||
                  "The queue may not have any contacts yet. Try again later."}
              </p>
            </div>
          ) : liveStats ? (
            <LiveStatsPanel data={liveStats} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium mb-1">No Queue Data</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Queue contacts into this campaign first, then live stats will appear here showing country distribution,
                phone status, priority breakdown, and next-in-line contacts.
              </p>
            </div>
          )}
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
              <ClientContactScoresTable campaignId={campaignId} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
