import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Replace, Info, Briefcase, Target, Building2, ChevronRight, Lightbulb, Settings, Globe, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";
import { motion, AnimatePresence } from "framer-motion";
import { TimezonePriorityManager } from "@/components/timezone-priority-manager";

interface QueueControlsProps {
  campaignId: string;
  agentId?: string;
  onQueueUpdated?: () => void;
  compact?: boolean; // Compact mode for header
  renderDialogs?: boolean; // Only render dialogs in one instance to prevent duplicates
}

interface QueueStats {
  total: number;
  queued: number;
  locked: number;
  in_progress: number;
  released: number;
}

export function QueueControls({ campaignId, agentId, onQueueUpdated, compact = false, renderDialogs = true }: QueueControlsProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Use user ID if agentId not provided
  const effectiveAgentId = agentId || user?.id || '';

  // State for confirmation dialogs
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);


  // State for replace queue options
  const [filterGroup, setFilterGroup] = useState();
  const [maxQueueSize, setMaxQueueSize] = useState(5000);
  const [scopeByTimezone, setScopeByTimezone] = useState(false);

  // Check if user has admin or manager role
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'campaign_manager';

  // Fetch campaign details to get audienceRefs
  const { data: campaign } = useQuery({
    queryKey: ['/api/campaigns', campaignId],
    enabled: !!campaignId,
  });

  // Fetch queue stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/campaigns', campaignId, 'queues/stats', effectiveAgentId],
    enabled: !!campaignId && !!effectiveAgentId,
  });

  // Reset state whenever dialog opens
  useEffect(() => {
    if (showReplaceDialog) {
      setFilterGroup(undefined);
      setMaxQueueSize(5000);
      setScopeByTimezone(false);
    }
  }, [showReplaceDialog]);

  // Fetch campaign-scoped queue preview (upper bound estimate with filtering)
  const { data: queuePreview, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['/api/campaigns', campaignId, 'queues/preview', JSON.stringify(filterGroup), effectiveAgentId, scopeByTimezone],
    queryFn: async () => {
      const response = await apiRequest('POST', `/api/campaigns/${campaignId}/queues/preview`, {
        agent_id: effectiveAgentId,
        filters: filterGroup || undefined,
        scope_by_timezone: scopeByTimezone,
      });
      return response.json();
    },
    enabled: !!campaignId && !!effectiveAgentId && showReplaceDialog,
    refetchOnWindowFocus: false,
    staleTime: 10000,
  });

  // Fetch timezone analysis when scoping is enabled
  const { data: timezoneAnalysis } = useQuery;
  }>({
    queryKey: ['/api/campaigns', campaignId, 'ops/timezone-analysis'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/campaigns/${campaignId}/ops/timezone-analysis`);
      return response.json();
    },
    enabled: !!campaignId && scopeByTimezone && showReplaceDialog,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  // Set Queue (Replace) mutation
  const replaceQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/campaigns/${campaignId}/queues/set`,
        {
          agent_id: effectiveAgentId,
          filters: filterGroup || undefined,
          per_account_cap: null,
          max_queue_size: maxQueueSize || null,
          keep_in_progress: true,
          allow_sharing: true,
          scope_by_timezone: scopeByTimezone,
        }
      );
      return response.json();
    },
    onSuccess: (data: any) => {
      const totalSkipped = data.total_skipped || 0;
      const descriptionParts = [
        `Queued: ${data.assigned} contacts`,
      ];
      
      if (data.released > 0) {
        descriptionParts.push(`Released: ${data.released} previous items`);
      }
      
      if (totalSkipped > 0) {
        descriptionParts.push(`Filtered out: ${totalSkipped} contacts`);
        if (data.skipped_no_phone > 0) {
          descriptionParts.push(`  - No valid phone: ${data.skipped_no_phone}`);
        }
        if (data.skipped_invalid > 0) {
          descriptionParts.push(`  - Invalid contacts: ${data.skipped_invalid}`);
        }
        if (data.skipped_campaign_suppression > 0) {
          descriptionParts.push(`  - Campaign suppressed: ${data.skipped_campaign_suppression}`);
        }
        if (data.skipped_global_dnc > 0) {
          descriptionParts.push(`  - Do Not Call list: ${data.skipped_global_dnc}`);
        }
        if (data.skipped_account_cap > 0) {
          descriptionParts.push(`  - Account cap reached: ${data.skipped_account_cap}`);
        }
        if (data.skipped_outside_business_hours > 0) {
          descriptionParts.push(`  - Outside business hours: ${data.skipped_outside_business_hours}`);
        }
        if (data.skipped_scheduled_retry > 0) {
          descriptionParts.push(`  - Scheduled for retry: ${data.skipped_scheduled_retry}`);
        }
        if (data.skipped_due_to_collision > 0) {
          descriptionParts.push(`  - Assigned to others: ${data.skipped_due_to_collision}`);
        }
      }
      
      toast({
        title: data.assigned > 0 ? "Queue Set Successfully" : "Queue Set - No Eligible Contacts",
        description: descriptionParts.join('\n'),
        variant: data.assigned === 0 ? "destructive" : "default",
        duration: 10000,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'queues/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-queue', effectiveAgentId] });
      setShowReplaceDialog(false);
      onQueueUpdated?.();
      // Reset form
      setFilterGroup(undefined);
      setMaxQueueSize(5000);
      setScopeByTimezone(false);
    },
    onError: (error: any) => {
      if (error.message === 'not_found') {
        toast({
          title: "Feature Not Available",
          description: "Queue management features are not enabled",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to replace queue",
          variant: "destructive",
        });
      }
    },
  });

  // Clear My Queue mutation
  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/campaigns/${campaignId}/queues/clear`,
        {
          agent_id: effectiveAgentId,
        }
      );
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Queue Cleared",
        description: `Released ${data.released} items from your queue`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'queues/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-queue', effectiveAgentId] });
      setShowClearDialog(false);
      onQueueUpdated?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear queue",
        variant: "destructive",
      });
    },
  });

  // Clear All Queues mutation (admin only)
  const clearAllQueuesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        'POST',
        `/api/campaigns/${campaignId}/queues/clear_all`,
        {}
      );
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "All Queues Cleared",
        description: `Released ${data.released} items from all agent queues`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'queues/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agent-queue'] });
      setShowClearAllDialog(false);
      onQueueUpdated?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear all queues",
        variant: "destructive",
      });
    },
  });

  const isPending = replaceQueueMutation.isPending || clearQueueMutation.isPending || clearAllQueuesMutation.isPending;

  // Render dialogs once at the end (shared between compact and full card modes)
  const renderSharedDialogs = () => {
    if (!renderDialogs) return null;

    return (
      <>
        {/* Replace Queue Dialog */}
        
          
            
              Set Queue Filters
              
                Configure filters to queue specific contacts for calling. Use AND/OR logic to combine multiple criteria.
              
            

            
              
                {/* Left Column: Filter Builder (takes 2/3 width on large screens) */}
                
                  
                    
                      
                      Filter Criteria
                    
                    
                      {filterGroup?.conditions && filterGroup.conditions.length > 0 && (
                        
                          
                            {filterGroup.conditions.length} {filterGroup.conditions.length === 1 ? 'filter' : 'filters'}
                          
                        
                      )}
                    
                  
                  
                  
                     setFilterGroup(filter || undefined)}
                      initialFilter={filterGroup}
                      embedded={true}
                      campaignId={campaignId}
                    />
                  

                  {/* Campaign-Scoped Queue Preview */}
                  {queuePreview && (
                    
                      
                        
                        Queue Preview {queuePreview.is_upper_bound && (upper bound)}
                      
                      
                        
                          Campaign audience:
                          {queuePreview.campaign_audience_count.toLocaleString()}
                        
                        
                          Matching filters:
                          {queuePreview.filter_match_count.toLocaleString()}
                        
                        
                          Max eligible (upper bound):
                          ≤ {queuePreview.eligible_count.toLocaleString()}
                        
                        {queuePreview.breakdown?.no_phone && queuePreview.breakdown.no_phone > 0 && (
                          
                            Missing phone:
                            {queuePreview.breakdown.no_phone.toLocaleString()}
                          
                        )}
                        {queuePreview.scope_by_timezone && queuePreview.breakdown?.estimated_outside_business_hours != null && queuePreview.breakdown.estimated_outside_business_hours > 0 && (
                          
                            
                              
                              Outside business hours:
                            
                            ~{queuePreview.breakdown.estimated_outside_business_hours.toLocaleString()}
                          
                        )}
                        {queuePreview.scope_by_timezone && queuePreview.breakdown?.sample_biz_hours_rate != null && (
                          
                            In business hours rate:
                            {queuePreview.breakdown.sample_biz_hours_rate}%
                          
                        )}
                      
                      {queuePreview.breakdown?.note && (
                        
                          {queuePreview.breakdown.note}
                        
                      )}
                    
                  )}

                  {isLoadingPreview && showReplaceDialog && (
                    
                      
                        
                        Calculating queue preview...
                      
                    
                  )}
                

                {/* Right Column: Settings & Guidance */}
                
                  {/* Queue Settings */}
                  
                    
                      
                      Queue Settings
                    
                    
                    
                      Max Queue Size
                       setMaxQueueSize(e.target.value ? parseInt(e.target.value) : 5000)}
                        data-testid="input-max-queue-size"
                        className="h-9"
                      />
                      
                        Maximum contacts to queue. Set higher for large campaigns (e.g., 10000+)
                      
                    

                    

                    {/* Scope by Timezone Toggle */}
                    
                      
                        
                          
                            
                            Scope by Timezone
                          
                          
                            Only queue contacts within business hours
                          
                        
                        
                      

                      {/* Timezone Analysis Summary */}
                      {scopeByTimezone && timezoneAnalysis && (
                        
                          
                            
                            Timezone Analysis
                          
                          
                            
                              {timezoneAnalysis.totalCallableNow}
                              Callable Now
                            
                            
                              {timezoneAnalysis.totalSleeping}
                              Sleeping
                            
                            
                              {timezoneAnalysis.totalUnknownTimezone}
                              Unknown TZ
                            
                          
                          {timezoneAnalysis.timezoneGroups.length > 0 && (
                            
                              {timezoneAnalysis.timezoneGroups.slice(0, 5).map((group) => (
                                
                                  {group.timezone}
                                  
                                    {group.contactCount}
                                    
                                  
                                
                              ))}
                            
                          )}
                        
                      )}
                    
                  

                  {/* Timezone Priority Configuration */}
                  

                  {/* Agent Guidance - Filter Examples */}
                  
                    
                      
                      
                        Agent Guidance: Filter Examples
                        
                        {/* Industry Filter Example */}
                        
                          
                            
                            Industry Filtering
                          
                          
                            Field: Account_Industry
                          
                          
                            
                              
                              Contains: "Technology" or "Software"
                            
                            
                              
                              Equals: "Financial Services"
                            
                          
                        

                        {/* Job Title Filter Example */}
                        
                          
                            
                            Job Title Filtering
                          
                          
                            Field: Contact_Job_Title
                          
                          
                            
                              
                              Contains: "Director" or "Manager"
                            
                            
                              
                              Starts with: "VP" or "Chief"
                            
                          
                        

                        {/* Seniority Filter Example */}
                        
                          
                            
                            Seniority Filtering
                          
                          
                            Field: Contact_Seniority
                          
                          
                            
                              
                              Equals: "C-Level" or "VP-Level"
                            
                            
                              
                              In: ["Director", "Manager", "Senior"]
                            
                          
                        

                        
                          Pro Tips:
                          
                            
                              
                              Use AND to combine requirements
                            
                            
                              
                              Use OR for multiple options
                            
                            
                              
                              Test filters before setting queue
                            
                          
                        
                      
                    
                  

                  {/* Phone Validation Warning */}
                  
                    
                      
                      
                        Phone Validation Filter
                        Contacts are automatically filtered during queue setting:
                        
                          Must have Contact Phone, Mobile, or HQ Phone
                          HQ Phone requires country match with contact
                          Invalid/missing phones are excluded
                        
                        Tip: If getting fewer contacts than expected, many may lack valid phone numbers
                      
                    
                  
                
              
            

            
              
                
                  {filterGroup?.conditions && filterGroup.conditions.length > 0 ? (
                    Filters configured and ready to apply
                  ) : (
                    No filters configured - will queue all campaign contacts
                  )}
                
                
                  
                    Cancel
                  
                   replaceQueueMutation.mutate()}
                    disabled={isPending}
                    data-testid="button-confirm-replace"
                    className="h-9"
                  >
                    {isPending ?  : null}
                    Set Queue
                  
                
              
            
          
        

        {/* Clear My Queue Dialog */}
        
          
            
              Clear My Queue
              
                This will release all queued and locked items from your queue. Items currently in progress will not be affected.
              
            
            
              Cancel
               clearQueueMutation.mutate()}
                disabled={isPending}
                data-testid="button-confirm-clear"
              >
                {isPending ?  : null}
                Clear Queue
              
            
          
        

        {/* Clear All Queues Dialog (Admin Only) */}
        
          
            
              Clear All Queues (Admin)
              
                This will release all queued and locked items from ALL agent queues in this campaign. 
                This action affects all agents and cannot be undone.
              
            
            
              Cancel
               clearAllQueuesMutation.mutate()}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-clear-all"
              >
                {isPending ?  : null}
                Clear All Queues
              
            
          
        
      
    );
  };

  // Compact mode for header
  if (compact) {
    return (
      <>
        
          {/* Custom queue controls disabled — unified intelligent queue system active */}
          
            
            Intelligent Queue
          
          
          {isLoadingStats ? (
            
          ) : stats && (
            
              {stats.queued} in queue
            
          )}
        
      
    );
  }

  // Full Card mode for sidebar/dedicated section
  return (
    <>
      
        
          
            
              
                
                Unified Intelligent Queue
              
              
                Contacts are automatically prioritized by the intelligent scoring engine.
                Queue distribution, tracking, and release are managed centrally for both human and AI agents.
              
            
            {isLoadingStats ? (
              
            ) : stats && (
              
                Queued: {stats.queued}
                In Progress: {stats.in_progress}
                Total: {stats.total}
              
            )}
          
        
        
          
            Custom queue filters have been replaced by the unified intelligent queue system.
            Contacts are scored and prioritized automatically based on industry fit, role fit, account fit, intent topics, and historical conversion data.
          
        
      
    
  );
}