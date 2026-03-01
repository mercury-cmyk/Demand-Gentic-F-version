import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2, ChevronsUpDown, Check, ChevronDown,
  Database, Megaphone, Zap, Settings2,
  Play, Square, Clock, CheckCircle2, XCircle, AlertCircle,
  Building2, Users, X, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ==================== Types ====================

interface ListItem {
  id: string;
  name: string;
  entityType: string;
  recordIds?: string[];
}

interface CampaignItem {
  id: string;
  name: string;
  type?: string;
  status?: string;
}

interface OiBatchJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  totalAccounts: number;
  processedAccounts: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  batchSize: number;
  concurrency: number;
  forceRefresh: boolean;
  listIds: string[];
  campaignIds: string[];
  accountCount?: number;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  errorLog: Array<{ accountId: string; accountName?: string; error: string }>;
  createdAt: string;
  updatedAt: string;
}

// ==================== Multi-Select Combobox ====================

function MultiSelectCombobox<T extends { id: string; name: string }>({
  items,
  selectedIds,
  onSelectionChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  renderItem,
  isLoading,
  icon: Icon,
}: {
  items: T[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  renderItem: (item: T, selected: boolean) => React.ReactNode;
  isLoading?: boolean;
  icon?: typeof Database;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[40px] font-normal"
          >
            <div className="flex items-center gap-2 truncate">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              {selectedIds.length === 0
                ? <span className="text-muted-foreground">{placeholder}</span>
                : <span>{selectedIds.length} selected</span>
              }
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Loading..." : emptyMessage}
              </CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.name} ${item.id}`}
                      onSelect={() => toggle(item.id)}
                    >
                      <div className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        selected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                      )}>
                        <Check className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {renderItem(item, selected)}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge
              key={item.id}
              variant="secondary"
              className="text-xs pr-1 gap-1"
            >
              {item.name}
              <button
                className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20 p-0.5"
                onClick={() => toggle(item.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Status Badge ====================

function JobStatusBadge({ status }: { status: OiBatchJob["status"] }) {
  const config = {
    pending: { variant: "outline" as const, icon: Clock, label: "Pending", className: "text-yellow-600 border-yellow-300" },
    processing: { variant: "default" as const, icon: Loader2, label: "Processing", className: "bg-blue-600" },
    completed: { variant: "default" as const, icon: CheckCircle2, label: "Completed", className: "bg-green-600" },
    failed: { variant: "destructive" as const, icon: XCircle, label: "Failed", className: "" },
    cancelled: { variant: "secondary" as const, icon: AlertCircle, label: "Cancelled", className: "" },
  };

  const c = config[status];
  const IconComp = c.icon;

  return (
    <Badge variant={c.variant} className={cn("gap-1", c.className)}>
      <IconComp className={cn("h-3 w-3", status === "processing" && "animate-spin")} />
      {c.label}
    </Badge>
  );
}

// ==================== Main Component ====================

export function OiBatchPipelineTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selection state
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

  // Config state
  const [batchSize, setBatchSize] = useState("5");
  const [concurrency, setConcurrency] = useState("2");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Expanded job
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Fetch lists
  const listsQuery = useQuery<ListItem[]>({
    queryKey: ["/api/lists"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lists");
      return res.json();
    },
  });

  // Fetch campaigns
  const campaignsQuery = useQuery<CampaignItem[]>({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns");
      return res.json();
    },
  });

  // Fetch jobs (poll every 5s when any job is running)
  const jobsQuery = useQuery<OiBatchJob[]>({
    queryKey: ["/api/oi-batch/jobs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/oi-batch/jobs?limit=20");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasRunning = data?.some(
        (j) => j.status === "pending" || j.status === "processing"
      );
      return hasRunning ? 5000 : 30000;
    },
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        listIds: selectedListIds,
        campaignIds: selectedCampaignIds,
        batchSize: Math.max(1, Math.min(Number(batchSize) || 5, 50)),
        concurrency: Math.max(1, Math.min(Number(concurrency) || 2, 5)),
        forceRefresh,
      };
      const res = await apiRequest("POST", "/api/oi-batch/jobs", payload);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Batch Job Created",
        description: `Processing ${data.totalAccounts} accounts (batch size: ${data.batchSize})`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/oi-batch/jobs"] });
      setSelectedListIds([]);
      setSelectedCampaignIds([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Job",
        description: error?.message || "Could not create batch job",
        variant: "destructive",
      });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/oi-batch/jobs/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job Cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/oi-batch/jobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Cancel",
        description: error?.message || "Could not cancel job",
        variant: "destructive",
      });
    },
  });

  const hasSelectors = selectedListIds.length > 0 || selectedCampaignIds.length > 0;
  const lists = listsQuery.data || [];
  const campaigns = campaignsQuery.data || [];
  const jobs = jobsQuery.data || [];
  const activeJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing");
  const pastJobs = jobs.filter((j) => j.status !== "pending" && j.status !== "processing");

  return (
    <div className="space-y-6">
      {/* Job Creation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Create Batch Intelligence Job
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Select lists and/or campaigns to batch-generate account intelligence. Jobs run in the background
            and process accounts in configurable batches.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* List Selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Lists
              </Label>
              <MultiSelectCombobox
                items={lists}
                selectedIds={selectedListIds}
                onSelectionChange={setSelectedListIds}
                placeholder="Select lists..."
                searchPlaceholder="Search lists..."
                emptyMessage="No lists found"
                isLoading={listsQuery.isLoading}
                icon={Database}
                renderItem={(item) => (
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{item.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[10px] h-4">
                        {item.entityType === "account" ? (
                          <><Building2 className="h-2.5 w-2.5 mr-0.5" />accounts</>
                        ) : (
                          <><Users className="h-2.5 w-2.5 mr-0.5" />contacts</>
                        )}
                      </Badge>
                      {item.recordIds && (
                        <span className="text-[10px] text-muted-foreground">
                          {item.recordIds.length.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Campaign Selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Megaphone className="h-3.5 w-3.5" />
                Campaigns
              </Label>
              <MultiSelectCombobox
                items={campaigns}
                selectedIds={selectedCampaignIds}
                onSelectionChange={setSelectedCampaignIds}
                placeholder="Select campaigns..."
                searchPlaceholder="Search campaigns..."
                emptyMessage="No campaigns found"
                isLoading={campaignsQuery.isLoading}
                icon={Megaphone}
                renderItem={(item) => (
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{item.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {item.type && (
                        <Badge variant="outline" className="text-[10px] h-4 capitalize">
                          {item.type}
                        </Badge>
                      )}
                      {item.status && (
                        <Badge
                          variant={item.status === "active" ? "default" : "secondary"}
                          className="text-[10px] h-4 capitalize"
                        >
                          {item.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Advanced Settings */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-8 px-2">
                <Settings2 className="h-3.5 w-3.5" />
                Advanced Settings
                <ChevronDown className={cn("h-3 w-3 transition-transform", advancedOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 rounded-md border bg-muted/30">
                <div className="space-y-2">
                  <Label className="text-xs">Batch Size (1-50)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    className="h-9 text-sm"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Accounts processed per batch cycle.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Concurrency (1-5)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    className="h-9 text-sm"
                    value={concurrency}
                    onChange={(e) => setConcurrency(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Parallel AI calls within each batch.
                  </p>
                </div>
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer" htmlFor="force-refresh-pipeline">Force Refresh</Label>
                    <Switch id="force-refresh-pipeline" checked={forceRefresh} onCheckedChange={setForceRefresh} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Regenerate intelligence even if existing data is fresh.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={() => createJobMutation.mutate()}
              disabled={!hasSelectors || createJobMutation.isPending}
              className="min-w-[200px]"
            >
              {createJobMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Job...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Batch Job
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Active Jobs ({activeJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map((job) => {
              const percent = job.totalAccounts > 0
                ? Math.floor((job.processedAccounts / job.totalAccounts) * 100)
                : 0;

              return (
                <div key={job.id} className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <JobStatusBadge status={job.status} />
                      <span className="text-sm font-mono text-muted-foreground">
                        {job.id.slice(0, 8)}...
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive"
                      onClick={() => cancelJobMutation.mutate(job.id)}
                      disabled={cancelJobMutation.isPending}
                    >
                      <Square className="h-3 w-3" />
                      Cancel
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{job.processedAccounts} / {job.totalAccounts} accounts</span>
                      <span>{percent}%</span>
                    </div>
                    <Progress value={percent} className="h-2" />
                  </div>

                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600">{job.successCount} success</span>
                    <span className="text-red-600">{job.failedCount} failed</span>
                    {job.skippedCount > 0 && (
                      <span className="text-yellow-600">{job.skippedCount} skipped</span>
                    )}
                    <span className="text-muted-foreground ml-auto">
                      Batch: {job.batchSize} | Concurrency: {job.concurrency}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Job History
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/oi-batch/jobs"] })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No batch jobs yet. Create one above to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Accounts</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const percent = job.totalAccounts > 0
                    ? Math.floor((job.processedAccounts / job.totalAccounts) * 100)
                    : 0;
                  const isExpanded = expandedJobId === job.id;
                  const createdAt = new Date(job.createdAt);
                  const duration = job.completedAt
                    ? formatDuration(new Date(job.completedAt).getTime() - createdAt.getTime())
                    : job.startedAt
                      ? formatDuration(Date.now() - new Date(job.startedAt).getTime()) + "..."
                      : "-";

                  return (
                    <>
                      <TableRow
                        key={job.id}
                        className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/30")}
                        onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      >
                        <TableCell><JobStatusBadge status={job.status} /></TableCell>
                        <TableCell className="font-medium">{job.totalAccounts.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={percent} className="h-1.5 w-16" />
                            <span className="text-xs text-muted-foreground">{percent}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-green-600">{job.successCount}</TableCell>
                        <TableCell className="text-red-600">{job.failedCount}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          B:{job.batchSize} C:{job.concurrency}
                          {job.forceRefresh && " R"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {createdAt.toLocaleDateString()} {createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{duration}</TableCell>
                      </TableRow>

                      {isExpanded && job.errorLog && job.errorLog.length > 0 && (
                        <TableRow key={`${job.id}-errors`}>
                          <TableCell colSpan={8} className="bg-muted/20 p-4">
                            <div className="space-y-2">
                              <h4 className="text-xs font-medium text-destructive">
                                Error Log ({job.errorLog.length} errors)
                              </h4>
                              <div className="max-h-[200px] overflow-auto space-y-1">
                                {job.errorLog.map((err, idx) => (
                                  <div key={idx} className="text-xs font-mono text-muted-foreground flex gap-2">
                                    <span className="text-destructive shrink-0">{err.accountId.slice(0, 8)}...</span>
                                    <span className="truncate">{err.error}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
