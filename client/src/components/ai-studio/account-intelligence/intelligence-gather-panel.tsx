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
  problems: Array<{ problemId: number; problemStatement: string; confidence: number }>;
  solutions: Array<{ serviceId: number; serviceName: string }>;
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

// ==================== Main Component ====================

export function IntelligenceGatherPanel() {
  const { toast } = useToast();

  // Selection state
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [mappingCampaignId, setMappingCampaignId] = useState("");

  // Advanced filter state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [concurrency, setConcurrency] = useState("3");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [includeAccountIntelligence, setIncludeAccountIntelligence] = useState(true);
  const [includeProblemMapping, setIncludeProblemMapping] = useState(true);

  // Expanded account detail
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

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

  // Gather mutation
  const gatherMutation = useMutation<IntelligenceGatherResponse>({
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
    <div className="space-y-6">
      {/* Selector Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListFilter className="h-4 w-4" />
            Account Intelligence Gathering
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Select lists and/or campaigns to run account intelligence, then view problem-solution mapping aligned to 7 departments.
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

          {/* Advanced Filters */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground h-8 px-2">
                <Settings2 className="h-3.5 w-3.5" />
                Advanced Filters
                <ChevronDown className={cn("h-3 w-3 transition-transform", advancedOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-md border bg-muted/30">
                <div className="space-y-2">
                  <Label className="text-xs">Mapping Campaign ID</Label>
                  <Input
                    value={mappingCampaignId}
                    onChange={(e) => setMappingCampaignId(e.target.value)}
                    placeholder="Campaign context for problem mapping"
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Provides extra campaign context for problem-solution alignment.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Concurrency (1-10)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="w-16 h-8 text-sm"
                      value={concurrency}
                      onChange={(e) => setConcurrency(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer" htmlFor="force-refresh">Force Refresh</Label>
                    <Switch id="force-refresh" checked={forceRefresh} onCheckedChange={setForceRefresh} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer" htmlFor="include-acct">Account Intelligence</Label>
                    <Switch id="include-acct" checked={includeAccountIntelligence} onCheckedChange={setIncludeAccountIntelligence} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer" htmlFor="include-prob">Problem/Solution Mapping</Label>
                    <Switch id="include-prob" checked={includeProblemMapping} onCheckedChange={setIncludeProblemMapping} />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={() => gatherMutation.mutate()}
              disabled={!hasSelectors || gatherMutation.isPending}
              className="min-w-[200px]"
            >
              {gatherMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gathering Intelligence...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run Intelligence Gathering
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {data && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">Resolved Accounts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.processed.totalAccounts.toLocaleString()}</p>
                {(data.resolved.fromLists > 0 || data.resolved.fromCampaigns > 0) && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {data.resolved.fromLists > 0 && `${data.resolved.fromLists} from lists`}
                    {data.resolved.fromLists > 0 && data.resolved.fromCampaigns > 0 && " / "}
                    {data.resolved.fromCampaigns > 0 && `${data.resolved.fromCampaigns} from campaigns`}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">Success</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{data.processed.success.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">Partial</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{data.processed.partial.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{data.processed.failed.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Execution Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Execution Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{data.message}</p>
              <p className="mt-1">
                Built account intelligence for{" "}
                <span className="font-medium text-foreground">{data.processed.accountIntelBuilt}</span> accounts and
                generated{" "}
                <span className="font-medium text-foreground">{data.processed.problemMappingsBuilt}</span> campaign-level
                mappings across departments:{" "}
                <span className="font-medium text-foreground">{data.departments.join(", ")}</span>.
              </p>
            </CardContent>
          </Card>

          {/* 7-Department View (first result with campaign mappings) */}
          {data.results.length > 0 && (() => {
            const firstWithMapping = data.results.find((r) => r.campaignMappings.length > 0);
            const mapping = firstWithMapping?.campaignMappings[0];
            if (!mapping) return null;
            return (
              <DepartmentResultsView
                departments={mapping.departments as DepartmentMapping[]}
                primaryDepartment={mapping.primaryDepartment}
                crossDepartmentAngles={mapping.crossDepartmentAngles}
              />
            );
          })()}

          {/* Account Results Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Account Results</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Intel Version</TableHead>
                    <TableHead>Campaign Mapping</TableHead>
                    <TableHead>Primary Dept</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No account-level results returned
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.results.slice(0, 100).map((row) => {
                      const firstMapping = row.campaignMappings[0];
                      const activeDepartments = (firstMapping?.departments || []).filter(
                        (d: any) => d.problemCount > 0 || d.solutionCount > 0
                      );
                      const isExpanded = expandedAccountId === row.accountId;

                      return (
                        <TableRow
                          key={row.accountId}
                          className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/30")}
                          onClick={() => setExpandedAccountId(isExpanded ? null : row.accountId)}
                        >
                          <TableCell className="font-medium">
                            {row.accountName || row.accountId}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.status === "success" ? "secondary" :
                                row.status === "partial" ? "outline" : "destructive"
                              }
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.accountIntelligence?.version ?? "-"}</TableCell>
                          <TableCell>{row.campaignMappings.length}</TableCell>
                          <TableCell>
                            {firstMapping?.primaryDepartment || "-"}
                            {activeDepartments.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {activeDepartments
                                  .slice(0, 3)
                                  .map((d: any) => `${d.department} (${d.problemCount}P/${d.solutionCount}S)`)
                                  .join(", ")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            {row.errors.length > 0
                              ? row.errors.slice(0, 2).join(" | ")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {data.results.length > 100 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Showing first 100 results out of {data.results.length.toLocaleString()}.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
