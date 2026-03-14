/**
 * Proxy Form Submission Panel
 *
 * Embeddable panel that allows admins to:
 * 1. View email campaign clickers
 * 2. Select which clickers to proxy-submit through a landing page form
 * 3. Configure pacing and UTM parameters
 * 4. Monitor submission job progress
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Ban,
} from "lucide-react";

interface ProxyFormSubmissionPanelProps {
  campaignId: string;
  pageSlug: string;
  campaignName?: string;
}

export default function ProxyFormSubmissionPanel({
  campaignId,
  pageSlug,
  campaignName,
}: ProxyFormSubmissionPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [utmSource, setUtmSource] = useState("email");
  const [utmMedium, setUtmMedium] = useState("proxy_submission");
  const [utmCampaign, setUtmCampaign] = useState(campaignName || "");
  const [minDelay, setMinDelay] = useState(3);
  const [maxDelay, setMaxDelay] = useState(15);

  // Fetch clickers
  const { data: clickersData, isLoading: clickersLoading } = useQuery<{
    clickers: Array<{
      contactId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      fullName: string | null;
      company: string | null;
      jobTitle: string | null;
      clickedAt: string;
    }>;
    total: number;
  }>({
    queryKey: ["/api/generative-studio/proxy-submissions/campaign", campaignId, "clickers"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/generative-studio/proxy-submissions/campaign/${campaignId}/clickers`
      );
      return res.json();
    },
    enabled: !!campaignId,
  });

  // Fetch existing jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery<{
    jobs: Array<{
      id: string;
      status: string;
      totalItems: number;
      completedItems: number;
      failedItems: number;
      createdAt: string;
      completedAt: string | null;
    }>;
  }>({
    queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/generative-studio/proxy-submissions/jobs?campaignId=${campaignId}`
      );
      return res.json();
    },
    enabled: !!campaignId,
    refetchInterval: 10000, // Auto-refresh every 10s to track progress
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/generative-studio/proxy-submissions/jobs", {
        pageSlug,
        campaignId,
        contactIds: Array.from(selectedIds),
        utmDefaults: {
          utmSource: utmSource || undefined,
          utmMedium: utmMedium || undefined,
          utmCampaign: utmCampaign || undefined,
        },
        minDelayMs: minDelay * 1000,
        maxDelayMs: maxDelay * 1000,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
      });
      toast({
        title: "Proxy submission job started",
        description: `${data.itemCount} contacts queued for form submission`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create submission job",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/generative-studio/proxy-submissions/jobs/${jobId}/cancel`
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
      });
      toast({ title: "Job cancelled" });
    },
  });

  const clickers = clickersData?.clickers || [];
  const jobs = jobsData?.jobs || [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === clickers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clickers.map((c) => c.contactId)));
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case "processing":
        return <Badge variant="default" className="bg-blue-600 text-[10px]"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case "pending":
        return <Badge variant="secondary" className="text-[10px]"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="text-[10px]"><Ban className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-100 text-orange-600">
          <Send className="w-3.5 h-3.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold leading-none">Proxy Form Submissions</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Submit clickers through landing page form via USA IPs
          </p>
        </div>
      </div>

      {/* Clickers list */}
      <div className="rounded-lg border bg-background">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">
              Email Clickers ({clickers.length})
            </span>
          </div>
          {clickers.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={selectAll}>
              {selectedIds.size === clickers.length ? "Deselect All" : "Select All"}
            </Button>
          )}
        </div>

        <div className="max-h-48 overflow-y-auto">
          {clickersLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Loading clickers...</span>
            </div>
          ) : clickers.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">No email clickers found for this campaign.</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Clickers appear here after contacts click links in sent emails.
              </p>
            </div>
          ) : (
            clickers.map((c) => {
              const name = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
              return (
                <label
                  key={c.contactId}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 cursor-pointer border-b last:border-0"
                >
                  <Checkbox
                    checked={selectedIds.has(c.contactId)}
                    onCheckedChange={() => toggleSelect(c.contactId)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.email || "No email"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground">{c.company || ""}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Clicked {new Date(c.clickedAt).toLocaleDateString()}
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* UTM & Pacing config */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Submission Settings
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">UTM Source</Label>
              <Input
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                placeholder="email"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">UTM Medium</Label>
              <Input
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                placeholder="proxy_submission"
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">UTM Campaign</Label>
            <Input
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder={campaignName || "campaign-name"}
              className="h-7 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Min Delay (sec)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={minDelay}
                onChange={(e) => setMinDelay(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Max Delay (sec)</Label>
              <Input
                type="number"
                min={2}
                max={120}
                value={maxDelay}
                onChange={(e) => setMaxDelay(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <Button
            onClick={() => createJobMutation.mutate()}
            disabled={createJobMutation.isPending || selectedIds.size === 0}
            className="w-full h-8 text-xs"
          >
            {createJobMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating job...</>
            ) : (
              <><Send className="w-3.5 h-3.5 mr-1.5" />Submit {selectedIds.size} Contacts via Proxy</>
            )}
          </Button>
        </div>
      )}

      {/* Job history */}
      {jobs.length > 0 && (
        <div className="rounded-lg border bg-background">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-xs font-medium">Submission Jobs</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["/api/generative-studio/proxy-submissions/jobs", campaignId],
                })
              }
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>

          <div className="max-h-40 overflow-y-auto divide-y">
            {jobs.map((job) => (
              <div key={job.id} className="px-3 py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {statusBadge(job.status)}
                    <span className="text-[11px] text-muted-foreground">
                      {job.completedItems}/{job.totalItems} done
                      {job.failedItems > 0 && `, ${job.failedItems} failed`}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </div>
                {(job.status === "pending" || job.status === "processing") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-destructive hover:text-destructive"
                    onClick={() => cancelJobMutation.mutate(job.id)}
                    disabled={cancelJobMutation.isPending}
                  >
                    <Ban className="w-3 h-3 mr-1" />Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
