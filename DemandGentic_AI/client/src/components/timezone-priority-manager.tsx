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
    countryDistribution: Record;
  };
}

interface TimezonePriorityManagerProps {
  campaignId: string;
}

export function TimezonePriorityManager({ campaignId }: TimezonePriorityManagerProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch config + live analysis
  const { data, isLoading, isError } = useQuery({
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
      
        
          
          Loading timezone data...
        
      
    );
  }

  if (isError || !data) {
    return null; // Silently hide if the endpoint fails
  }

  return (
    
      {/* Header with toggle */}
      
        
          
            
            Timezone Priority
          
          
            Boost or deprioritize specific timezones
          
        
         {
            setEnabled(checked);
            setHasUnsavedChanges(true);
          }}
        />
      

      {enabled && (
        <>
          {/* Summary stats */}
          {totalQueued > 0 && (
            
              
              {totalQueued.toLocaleString()} queued across {groups.length} timezone{groups.length !== 1 ? "s" : ""}
              {activeOverrideCount > 0 && (
                
                  {activeOverrideCount} override{activeOverrideCount !== 1 ? "s" : ""}
                
              )}
            
          )}

          {/* Expand/collapse toggle */}
           setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Show"} timezone list ({groups.length})
            {expanded ? (
              
            ) : (
              
            )}
          

          {/* Timezone group list */}
          {expanded && (
            
              {groups.map((group) => {
                const tzKey = group.timezone === "Unknown" ? "__unknown__" : group.timezone;
                const currentBoost = getCurrentBoost(tzKey);
                const preset = getPresetForBoost(currentBoost);
                const displayName = group.timezone === "Unknown"
                  ? "Unknown Timezone"
                  : group.timezone.replace(/_/g, " ");

                return (
                  
                    {/* Status indicator */}
                    

                    {/* Timezone name + country */}
                    
                      
                        {displayName}
                      
                      {group.country && group.timezone !== "Unknown" && (
                        
                          {group.country}
                        
                      )}
                    

                    {/* Contact count */}
                    
                      {group.contactCount.toLocaleString()}
                    

                    {/* Priority selector */}
                    
                        setBoostForTimezone(tzKey, Number(val), group.country)
                      }
                    >
                      
                        
                      
                      
                        {PRIORITY_PRESETS.map((p) => (
                          
                            {p.label}
                            {p.value !== 0 && (
                              
                                ({p.value > 0 ? "+" : ""}{p.value})
                              
                            )}
                          
                        ))}
                      
                    
                  
                );
              })}

              {groups.length === 0 && (
                
                  No queued contacts found. Queue contacts first to configure timezone priorities.
                
              )}
            
          )}

          

          {/* Action buttons */}
          
            
              
              Reset
            
             saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasUnsavedChanges}
            >
              {saveMutation.isPending ? (
                
              ) : (
                
              )}
              {hasUnsavedChanges ? "Save & Apply" : "Saved"}
            
          

          {/* Last saved info */}
          {data.config.updatedAt && (
            
              
              Last saved: {new Date(data.config.updatedAt).toLocaleString()}
            
          )}
        
      )}
    
  );
}