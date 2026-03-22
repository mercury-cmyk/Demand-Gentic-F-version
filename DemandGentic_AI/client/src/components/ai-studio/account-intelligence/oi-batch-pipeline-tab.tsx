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
  errorLog: Array;
  createdAt: string;
  updatedAt: string;
}

// ==================== Multi-Select Combobox ====================

function MultiSelectCombobox({
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
    
      
        
          
            
              {Icon && }
              {selectedIds.length === 0
                ? {placeholder}
                : {selectedIds.length} selected
              }
            
            
          
        
        
          
            
            
              
                {isLoading ? "Loading..." : emptyMessage}
              
              
                {items.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                     toggle(item.id)}
                    >
                      
                        
                      
                      
                        {renderItem(item, selected)}
                      
                    
                  );
                })}
              
            
          
        
      

      {selectedItems.length > 0 && (
        
          {selectedItems.map((item) => (
            
              {item.name}
               toggle(item.id)}
              >
                
              
            
          ))}
        
      )}
    
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
    
      
      {c.label}
    
  );
}

// ==================== Main Component ====================

export function OiBatchPipelineTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selection state
  const [selectedListIds, setSelectedListIds] = useState([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);

  // Config state
  const [batchSize, setBatchSize] = useState("5");
  const [concurrency, setConcurrency] = useState("2");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Expanded job
  const [expandedJobId, setExpandedJobId] = useState(null);

  // Fetch lists
  const listsQuery = useQuery({
    queryKey: ["/api/lists"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lists");
      return res.json();
    },
  });

  // Fetch campaigns
  const campaignsQuery = useQuery({
    queryKey: ["/api/campaigns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/campaigns");
      return res.json();
    },
  });

  // Fetch jobs (poll every 5s when any job is running)
  const jobsQuery = useQuery({
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
    
      {/* Job Creation Card */}
      
        
          
            
            Create Batch Intelligence Job
          
        
        
          
            Select lists and/or campaigns to batch-generate account intelligence. Jobs run in the background
            and process accounts in configurable batches.
          

          
            {/* List Selector */}
            
              
                
                Lists
              
               (
                  
                    {item.name}
                    
                      
                        {item.entityType === "account" ? (
                          <>accounts
                        ) : (
                          <>contacts
                        )}
                      
                      {item.recordIds && (
                        
                          {item.recordIds.length.toLocaleString()}
                        
                      )}
                    
                  
                )}
              />
            

            {/* Campaign Selector */}
            
              
                
                Campaigns
              
               (
                  
                    {item.name}
                    
                      {item.type && (
                        
                          {item.type}
                        
                      )}
                      {item.status && (
                        
                          {item.status}
                        
                      )}
                    
                  
                )}
              />
            
          

          {/* Advanced Settings */}
          
            
              
                
                Advanced Settings
                
              
            
            
              
                
                  Batch Size (1-50)
                   setBatchSize(e.target.value)}
                  />
                  
                    Accounts processed per batch cycle.
                  
                
                
                  Concurrency (1-5)
                   setConcurrency(e.target.value)}
                  />
                  
                    Parallel AI calls within each batch.
                  
                
                
                  
                    Force Refresh
                    
                  
                  
                    Regenerate intelligence even if existing data is fresh.
                  
                
              
            
          

          

          
             createJobMutation.mutate()}
              disabled={!hasSelectors || createJobMutation.isPending}
              className="min-w-[200px]"
            >
              {createJobMutation.isPending ? (
                <>
                  
                  Creating Job...
                
              ) : (
                <>
                  
                  Start Batch Job
                
              )}
            
          
        
      

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        
          
            
              
              Active Jobs ({activeJobs.length})
            
          
          
            {activeJobs.map((job) => {
              const percent = job.totalAccounts > 0
                ? Math.floor((job.processedAccounts / job.totalAccounts) * 100)
                : 0;

              return (
                
                  
                    
                      
                      
                        {job.id.slice(0, 8)}...
                      
                    
                     cancelJobMutation.mutate(job.id)}
                      disabled={cancelJobMutation.isPending}
                    >
                      
                      Cancel
                    
                  

                  
                    
                      {job.processedAccounts} / {job.totalAccounts} accounts
                      {percent}%
                    
                    
                  

                  
                    {job.successCount} success
                    {job.failedCount} failed
                    {job.skippedCount > 0 && (
                      {job.skippedCount} skipped
                    )}
                    
                      Batch: {job.batchSize} | Concurrency: {job.concurrency}
                    
                  
                
              );
            })}
          
        
      )}

      {/* Job History */}
      
        
          
            
              
              Job History
            
             queryClient.invalidateQueries({ queryKey: ["/api/oi-batch/jobs"] })}
            >
              
              Refresh
            
          
        
        
          {jobs.length === 0 ? (
            
              No batch jobs yet. Create one above to get started.
            
          ) : (
            
              
                
                  Status
                  Accounts
                  Progress
                  Success
                  Failed
                  Config
                  Created
                  Duration
                
              
              
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
                       setExpandedJobId(isExpanded ? null : job.id)}
                      >
                        
                        {job.totalAccounts.toLocaleString()}
                        
                          
                            
                            {percent}%
                          
                        
                        {job.successCount}
                        {job.failedCount}
                        
                          B:{job.batchSize} C:{job.concurrency}
                          {job.forceRefresh && " R"}
                        
                        
                          {createdAt.toLocaleDateString()} {createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        
                        {duration}
                      

                      {isExpanded && job.errorLog && job.errorLog.length > 0 && (
                        
                          
                            
                              
                                Error Log ({job.errorLog.length} errors)
                              
                              
                                {job.errorLog.map((err, idx) => (
                                  
                                    {err.accountId.slice(0, 8)}...
                                    {err.error}
                                  
                                ))}
                              
                            
                          
                        
                      )}
                    
                  );
                })}
              
            
          )}
        
      
    
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