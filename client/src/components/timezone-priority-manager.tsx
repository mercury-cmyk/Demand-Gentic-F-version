import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Clock,
  Loader2,
  RotateCcw,
  Save,
  ChevronDown,
  ChevronUp,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

/* ── Priority preset definitions ── */
const PRIORITY_PRESETS = [
  { label: "Top Priority", value: 300, color: "text-emerald-600 dark:text-emerald-400" },
  { label: "Boost", value: 100, color: "text-blue-600 dark:text-blue-400" },
  { label: "Default", value: 0, color: "text-slate-600 dark:text-slate-400" },
  { label: "Lower", value: -50, color: "text-amber-600 dark:text-amber-400" },
  { label: "Deprioritize", value: -150, color: "text-red-600 dark:text-red-400" },
] as const;

function getPresetForBoost(boost: number) {
  // Find exact match or closest preset
  const exact = PRIORITY_PRESETS.find(p => p.value === boost);
  if (exact) return exact;
  // Default to "Default" for unknown values
  return PRIORITY_PRESETS[2];
}

/* ── Types ── */
interface TimezoneGroupEnriched {
  timezone: string;
  contactCount: number;
  isCurrentlyOpen: boolean;
  opensAt: string | null;
  suggestedPriority: number;
  country: string | null;
  priorityBoost: number;
  effectivePriority: number;
  hasOverride: boolean;
}

interface TimezonePriorityOverride {
  timezone: string;
  country?: string;
  priorityBoost: number;
}

interface TimezonePriorityConfig {
  enabled: boolean;
  overrides: TimezonePriorityOverride[];
  updatedAt?: string;
  updatedBy?: string;
}

interface TimezonePriorityResponse {
  config: TimezonePriorityConfig;
  analysis: {
    campaignId: string;
    analyzedAt: string;
    totalQueued: number;
    totalCallableNow: number;
    totalSleeping: number;
    totalUnknownTimezone: number;
    timezoneGroups: TimezoneGroupEnriched[];
    countryDistribution: Record<string, number>;
  };
}

interface TimezonePriorityManagerProps {
  campaignId: string;
}

export function TimezonePriorityManager({ campaignId }: TimezonePriorityManagerProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [overrides, setOverrides] = useState<TimezonePriorityOverride[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch config + live analysis
  const { data, isLoading, isError } = useQuery<TimezonePriorityResponse>({
    queryKey: ["/api/campaigns", campaignId, "ops/timezone-priority-config"],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/campaigns/${campaignId}/ops/timezone-priority-config`
      );
      return response.json();
    },
    enabled: !!campaignId,
    staleTime: 30000,
  });

  // Sync local state from fetched data
  useEffect(() => {
    if (data?.config) {
      setEnabled(data.config.enabled);
      setOverrides(data.config.overrides || []);
      setHasUnsavedChanges(false);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "PUT",
        `/api/campaigns/${campaignId}/ops/timezone-priority-config`,
        {
          enabled,
          overrides,
          reseed: true,
        }
      );
      return response.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "ops/timezone-priority-config"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", campaignId, "ops/timezone-analysis"],
      });
      const reseeded = result.seedResult?.updated ?? 0;
      toast({
        title: "Timezone Priorities Saved",
        description: `Configuration saved.${reseeded > 0 ? ` Re-seeded ${reseeded} queued items.` : ""}`,
      });
      setHasUnsavedChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save timezone priority config",
        variant: "destructive",
      });
    },
  });

  // Update an override for a specific timezone
  function setBoostForTimezone(tzKey: string, boost: number, country?: string | null) {
    setHasUnsavedChanges(true);
    if (boost === 0) {
      // Remove override (revert to default)
      setOverrides(prev => prev.filter(o => o.timezone !== tzKey));
    } else {
      setOverrides(prev => {
        const existing = prev.findIndex(o => o.timezone === tzKey);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], priorityBoost: boost };
          return updated;
        }
        return [...prev, { timezone: tzKey, country: country || undefined, priorityBoost: boost }];
      });
    }
  }

  function resetAll() {
    setOverrides([]);
    setEnabled(false);
    setHasUnsavedChanges(true);
  }

  const groups = data?.analysis?.timezoneGroups || [];
  const totalQueued = data?.analysis?.totalQueued || 0;
  const activeOverrideCount = overrides.filter(o => o.priorityBoost !== 0).length;

  // Get current boost for a timezone
  function getCurrentBoost(tzKey: string): number {
    const override = overrides.find(o => o.timezone === tzKey);
    return override?.priorityBoost ?? 0;
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading timezone data...
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return null; // Silently hide if the endpoint fails
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-indigo-500" />
            Timezone Priority
          </Label>
          <p className="text-xs text-muted-foreground">
            Boost or deprioritize specific timezones
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setEnabled(checked);
            setHasUnsavedChanges(true);
          }}
        />
      </div>

      {enabled && (
        <>
          {/* Summary stats */}
          {totalQueued > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{totalQueued.toLocaleString()} queued across {groups.length} timezone{groups.length !== 1 ? "s" : ""}</span>
              {activeOverrideCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {activeOverrideCount} override{activeOverrideCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}

          {/* Expand/collapse toggle */}
          <button
            type="button"
            className="w-full flex items-center justify-between text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            <span>{expanded ? "Hide" : "Show"} timezone list ({groups.length})</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Timezone group list */}
          {expanded && (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {groups.map((group) => {
                const tzKey = group.timezone === "Unknown" ? "__unknown__" : group.timezone;
                const currentBoost = getCurrentBoost(tzKey);
                const preset = getPresetForBoost(currentBoost);
                const displayName = group.timezone === "Unknown"
                  ? "Unknown Timezone"
                  : group.timezone.replace(/_/g, " ");

                return (
                  <div
                    key={tzKey}
                    className="flex items-center gap-2 p-2 rounded-md bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                  >
                    {/* Status indicator */}
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        group.isCurrentlyOpen
                          ? "bg-green-500"
                          : group.timezone === "Unknown"
                          ? "bg-slate-400"
                          : "bg-amber-500"
                      }`}
                      title={
                        group.isCurrentlyOpen
                          ? "Business hours open"
                          : group.opensAt
                          ? `Opens at ${new Date(group.opensAt).toLocaleTimeString()}`
                          : "Unknown"
                      }
                    />

                    {/* Timezone name + country */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate" title={group.timezone}>
                        {displayName}
                      </p>
                      {group.country && group.timezone !== "Unknown" && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {group.country}
                        </p>
                      )}
                    </div>

                    {/* Contact count */}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                      {group.contactCount.toLocaleString()}
                    </Badge>

                    {/* Priority selector */}
                    <Select
                      value={String(currentBoost)}
                      onValueChange={(val) =>
                        setBoostForTimezone(tzKey, Number(val), group.country)
                      }
                    >
                      <SelectTrigger className="h-6 w-[120px] text-[10px] flex-shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={String(p.value)}>
                            <span className={p.color}>{p.label}</span>
                            {p.value !== 0 && (
                              <span className="ml-1 text-muted-foreground">
                                ({p.value > 0 ? "+" : ""}{p.value})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No queued contacts found. Queue contacts first to configure timezone priorities.
                </p>
              )}
            </div>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={resetAll}
              disabled={saveMutation.isPending}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasUnsavedChanges}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              {hasUnsavedChanges ? "Save & Apply" : "Saved"}
            </Button>
          </div>

          {/* Last saved info */}
          {data.config.updatedAt && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              Last saved: {new Date(data.config.updatedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
