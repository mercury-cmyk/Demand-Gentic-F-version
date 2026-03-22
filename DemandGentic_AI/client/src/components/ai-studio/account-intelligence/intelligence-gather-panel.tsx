import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  Database, Megaphone, Zap, Settings2, ListFilter,
  Users, Building2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DepartmentResultsView, type DepartmentMapping } from "./department-results-view";

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

interface IntelligenceDepartmentRow {
  department: string;
  confidence: number;
  recommendedApproach: string;
  messagingAngle: string;
  painPoints: string[];
  priorities: string[];
  commonObjections: string[];
  problems: Array;
  solutions: Array;
  problemCount: number;
  solutionCount: number;
}

interface IntelligenceCampaignMapping {
  campaignId: string;
  campaignName: string | null;
  primaryDepartment: string | null;
  confidence: number;
  crossDepartmentAngles?: string[];
  departments: IntelligenceDepartmentRow[];
}

interface IntelligenceResultRow {
  accountId: string;
  accountName: string | null;
  status: "success" | "partial" | "failed";
  accountIntelligence: {
    version: number;
    confidence: number | null;
    createdAt: string | null;
  } | null;
  campaignMappings: IntelligenceCampaignMapping[];
  errors: string[];
}

interface IntelligenceGatherResponse {
  message: string;
  departments: string[];
  resolved: {
    totalAccounts: number;
    explicitAccountIds: number;
    fromLists: number;
    fromCampaigns: number;
  };
  processed: {
    totalAccounts: number;
    success: number;
    partial: number;
    failed: number;
    accountIntelBuilt: number;
    problemMappingsBuilt: number;
  };
  results: IntelligenceResultRow[];
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

// ==================== Main Component ====================

export function IntelligenceGatherPanel() {
  const { toast } = useToast();

  // Selection state
  const [selectedListIds, setSelectedListIds] = useState([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  const [mappingCampaignId, setMappingCampaignId] = useState("");

  // Advanced filter state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [concurrency, setConcurrency] = useState("3");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [includeAccountIntelligence, setIncludeAccountIntelligence] = useState(true);
  const [includeProblemMapping, setIncludeProblemMapping] = useState(true);

  // Expanded account detail
  const [expandedAccountId, setExpandedAccountId] = useState(null);

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

  // Gather mutation
  const gatherMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        listIds: selectedListIds,
        campaignIds: selectedCampaignIds,
        mappingCampaignId: mappingCampaignId.trim() || undefined,
        concurrency: Math.max(1, Math.min(Number(concurrency) || 3, 10)),
        forceRefresh,
        includeAccountIntelligence,
        includeProblemMapping,
      };
      const res = await apiRequest("POST", "/api/data-management/intelligence/gather", payload);
      return res.json();
    },
    onError: (error: any) => {
      toast({
        title: "Intelligence Gathering Failed",
        description: error?.message || "Failed to run account intelligence gathering",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Intelligence Gathering Complete",
        description: `Processed ${data.processed.totalAccounts} accounts: ${data.processed.success} success, ${data.processed.partial} partial, ${data.processed.failed} failed`,
      });
    },
  });

  const hasSelectors = selectedListIds.length > 0 || selectedCampaignIds.length > 0;
  const data = gatherMutation.data;
  const lists = listsQuery.data || [];
  const campaigns = campaignsQuery.data || [];

  return (
    
      {/* Selector Card */}
      
        
          
            
            Account Intelligence Gathering
          
        
        
          
            Select lists and/or campaigns to run account intelligence, then view problem-solution mapping aligned to 7 departments.
          

          
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
            
          

          {/* Advanced Filters */}
          
            
              
                
                Advanced Filters
                
              
            
            
              
                
                  Mapping Campaign ID
                   setMappingCampaignId(e.target.value)}
                    placeholder="Campaign context for problem mapping"
                    className="h-9 text-sm"
                  />
                  
                    Optional. Provides extra campaign context for problem-solution alignment.
                  
                

                
                  
                    Concurrency (1-10)
                     setConcurrency(e.target.value)}
                    />
                  
                  
                    Force Refresh
                    
                  
                  
                    Account Intelligence
                    
                  
                  
                    Problem/Solution Mapping
                    
                  
                
              
            
          

          

          
             gatherMutation.mutate()}
              disabled={!hasSelectors || gatherMutation.isPending}
              className="min-w-[200px]"
            >
              {gatherMutation.isPending ? (
                <>
                  
                  Gathering Intelligence...
                
              ) : (
                <>
                  
                  Run Intelligence Gathering
                
              )}
            
          
        
      

      {/* Results */}
      {data && (
        <>
          {/* Summary Stats */}
          
            
              
                Resolved Accounts
              
              
                {data.processed.totalAccounts.toLocaleString()}
                {(data.resolved.fromLists > 0 || data.resolved.fromCampaigns > 0) && (
                  
                    {data.resolved.fromLists > 0 && `${data.resolved.fromLists} from lists`}
                    {data.resolved.fromLists > 0 && data.resolved.fromCampaigns > 0 && " / "}
                    {data.resolved.fromCampaigns > 0 && `${data.resolved.fromCampaigns} from campaigns`}
                  
                )}
              
            
            
              
                Success
              
              
                {data.processed.success.toLocaleString()}
              
            
            
              
                Partial
              
              
                {data.processed.partial.toLocaleString()}
              
            
            
              
                Failed
              
              
                {data.processed.failed.toLocaleString()}
              
            
          

          {/* Execution Summary */}
          
            
              Execution Summary
            
            
              {data.message}
              
                Built account intelligence for{" "}
                {data.processed.accountIntelBuilt} accounts and
                generated{" "}
                {data.processed.problemMappingsBuilt} campaign-level
                mappings across departments:{" "}
                {data.departments.join(", ")}.
              
            
          

          {/* 7-Department View (first result with campaign mappings) */}
          {data.results.length > 0 && (() => {
            const firstWithMapping = data.results.find((r) => r.campaignMappings.length > 0);
            const mapping = firstWithMapping?.campaignMappings[0];
            if (!mapping) return null;
            return (
              
            );
          })()}

          {/* Account Results Table */}
          
            
              Account Results
            
            
              
                
                  
                    Account
                    Status
                    Intel Version
                    Campaign Mapping
                    Primary Dept
                    Errors
                  
                
                
                  {data.results.length === 0 ? (
                    
                      
                        No account-level results returned
                      
                    
                  ) : (
                    data.results.slice(0, 100).map((row) => {
                      const firstMapping = row.campaignMappings[0];
                      const activeDepartments = (firstMapping?.departments || []).filter(
                        (d: any) => d.problemCount > 0 || d.solutionCount > 0
                      );
                      const isExpanded = expandedAccountId === row.accountId;

                      return (
                         setExpandedAccountId(isExpanded ? null : row.accountId)}
                        >
                          
                            {row.accountName || row.accountId}
                          
                          
                            
                              {row.status}
                            
                          
                          {row.accountIntelligence?.version ?? "-"}
                          {row.campaignMappings.length}
                          
                            {firstMapping?.primaryDepartment || "-"}
                            {activeDepartments.length > 0 && (
                              
                                {activeDepartments
                                  .slice(0, 3)
                                  .map((d: any) => `${d.department} (${d.problemCount}P/${d.solutionCount}S)`)
                                  .join(", ")}
                              
                            )}
                          
                          
                            {row.errors.length > 0
                              ? row.errors.slice(0, 2).join(" | ")
                              : "-"}
                          
                        
                      );
                    })
                  )}
                
              
              {data.results.length > 100 && (
                
                  Showing first 100 results out of {data.results.length.toLocaleString()}.
                
              )}
            
          
        
      )}
    
  );
}