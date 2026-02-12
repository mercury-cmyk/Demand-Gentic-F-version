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
import { Loader2, RefreshCw, Trash2, Replace, Info, Briefcase, Target, Building2, ChevronRight, Lightbulb, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Separator } from "@/components/ui/separator";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";
import { motion, AnimatePresence } from "framer-motion";

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
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>();
  const [maxQueueSize, setMaxQueueSize] = useState<number | ''>(5000);

  // Check if user has admin or manager role
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'campaign_manager';

  // Fetch campaign details to get audienceRefs
  const { data: campaign } = useQuery<any>({
    queryKey: ['/api/campaigns', campaignId],
    enabled: !!campaignId,
  });

  // Fetch queue stats
  const { data: stats, isLoading: isLoadingStats } = useQuery<QueueStats>({
    queryKey: ['/api/campaigns', campaignId, 'queues/stats', effectiveAgentId],
    enabled: !!campaignId && !!effectiveAgentId,
  });

  // Reset state whenever dialog opens
  useEffect(() => {
    if (showReplaceDialog) {
      setFilterGroup(undefined);
      setMaxQueueSize(5000);
    }
  }, [showReplaceDialog]);

  // Fetch campaign-scoped queue preview (upper bound estimate with filtering)
  const { data: queuePreview, isLoading: isLoadingPreview } = useQuery<{
    campaign_audience_count: number;
    filter_match_count: number;
    eligible_count: number;
    is_upper_bound?: boolean;
    breakdown?: {
      no_phone?: number;
      note?: string;
    };
  }>({
    queryKey: ['/api/campaigns', campaignId, 'queues/preview', JSON.stringify(filterGroup), effectiveAgentId],
    queryFn: async () => {
      const response = await apiRequest('POST', `/api/campaigns/${campaignId}/queues/preview`, {
        agent_id: effectiveAgentId,
        filters: filterGroup || undefined,
      });
      return response.json();
    },
    enabled: !!campaignId && !!effectiveAgentId && showReplaceDialog,
    refetchOnWindowFocus: false,
    staleTime: 10000,
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
        <AlertDialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
          <AlertDialogContent className="max-w-5xl w-[95vw] max-h-[90vh] flex flex-col p-0">
            <AlertDialogHeader className="px-6 pt-6 pb-4 border-b">
              <AlertDialogTitle className="text-lg font-semibold">Set Queue Filters</AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Configure filters to queue specific contacts for calling. Use AND/OR logic to combine multiple criteria.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Filter Builder (takes 2/3 width on large screens) */}
                <motion.div 
                  className="lg:col-span-2 space-y-4"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Filter Criteria
                    </h3>
                    <AnimatePresence mode="wait">
                      {filterGroup?.conditions && filterGroup.conditions.length > 0 && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <Badge variant="secondary" className="text-xs" data-testid="badge-filter-count">
                            {filterGroup.conditions.length} {filterGroup.conditions.length === 1 ? 'filter' : 'filters'}
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <SidebarFilters
                      entityType="contact"
                      onApplyFilter={(filter) => setFilterGroup(filter || undefined)}
                      initialFilter={filterGroup}
                      embedded={true}
                      campaignId={campaignId}
                    />
                  </motion.div>

                  {/* Campaign-Scoped Queue Preview */}
                  {queuePreview && (
                    <motion.div
                      className="mt-4 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                    >
                      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Queue Preview {queuePreview.is_upper_bound && <span className="text-xs font-normal">(upper bound)</span>}
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Campaign audience:</span>
                          <span className="font-medium">{queuePreview.campaign_audience_count.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Matching filters:</span>
                          <span className="font-medium">{queuePreview.filter_match_count.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 mt-2">
                          <span className="text-slate-900 dark:text-slate-100 font-medium">Max eligible (upper bound):</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">≤ {queuePreview.eligible_count.toLocaleString()}</span>
                        </div>
                        {queuePreview.breakdown?.no_phone && queuePreview.breakdown.no_phone > 0 && (
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Missing phone:</span>
                            <span>{queuePreview.breakdown.no_phone.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      {queuePreview.breakdown?.note && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                          {queuePreview.breakdown.note}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {isLoadingPreview && showReplaceDialog && (
                    <div className="mt-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
                        Calculating queue preview...
                      </div>
                    </div>
                  )}
                </motion.div>

                {/* Right Column: Settings & Guidance */}
                <motion.div 
                  className="space-y-4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  {/* Queue Settings */}
                  <div 
                    className="space-y-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 transition-opacity hover:opacity-90"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Queue Settings
                    </h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="maxQueueSize" className="text-sm font-medium">Max Queue Size</Label>
                      <Input
                        id="maxQueueSize"
                        type="number"
                        min="1"
                        placeholder="5000"
                        value={maxQueueSize}
                        onChange={(e) => setMaxQueueSize(e.target.value ? parseInt(e.target.value) : 5000)}
                        data-testid="input-max-queue-size"
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum contacts to queue. Set higher for large campaigns (e.g., 10000+)
                      </p>
                    </div>
                  </div>

                  {/* Agent Guidance - Filter Examples */}
                  <motion.div 
                    className="space-y-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-3 text-xs flex-1">
                        <p className="font-bold text-emerald-800 dark:text-emerald-100">Agent Guidance: Filter Examples</p>
                        
                        {/* Industry Filter Example */}
                        <div className="space-y-1.5 p-3 rounded-md bg-white/50 dark:bg-slate-800/50 border border-emerald-200 dark:border-emerald-700">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-100">
                            <Building2 className="h-3 w-3" />
                            <span>Industry Filtering</span>
                          </div>
                          <p className="text-emerald-700 dark:text-emerald-200 leading-relaxed">
                            <span className="font-medium">Field:</span> <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-100">Account_Industry</code>
                          </p>
                          <div className="space-y-1">
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">Contains:</span> "Technology" or "Software"
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">Equals:</span> "Financial Services"
                            </p>
                          </div>
                        </div>

                        {/* Job Title Filter Example */}
                        <div className="space-y-1.5 p-3 rounded-md bg-white/50 dark:bg-slate-800/50 border border-emerald-200 dark:border-emerald-700">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-100">
                            <Briefcase className="h-3 w-3" />
                            <span>Job Title Filtering</span>
                          </div>
                          <p className="text-emerald-700 dark:text-emerald-200 leading-relaxed">
                            <span className="font-medium">Field:</span> <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-100">Contact_Job_Title</code>
                          </p>
                          <div className="space-y-1">
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">Contains:</span> "Director" or "Manager"
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">Starts with:</span> "VP" or "Chief"
                            </p>
                          </div>
                        </div>

                        {/* Seniority Filter Example */}
                        <div className="space-y-1.5 p-3 rounded-md bg-white/50 dark:bg-slate-800/50 border border-emerald-200 dark:border-emerald-700">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-100">
                            <Target className="h-3 w-3" />
                            <span>Seniority Filtering</span>
                          </div>
                          <p className="text-emerald-700 dark:text-emerald-200 leading-relaxed">
                            <span className="font-medium">Field:</span> <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-100">Contact_Seniority</code>
                          </p>
                          <div className="space-y-1">
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">Equals:</span> "C-Level" or "VP-Level"
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              <span className="font-medium">In:</span> ["Director", "Manager", "Senior"]
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-emerald-200 dark:border-emerald-700">
                          <p className="font-semibold text-emerald-800 dark:text-emerald-100">Pro Tips:</p>
                          <ul className="space-y-1 mt-1.5">
                            <li className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              Use <span className="font-medium">AND</span> to combine requirements
                            </li>
                            <li className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              Use <span className="font-medium">OR</span> for multiple options
                            </li>
                            <li className="text-emerald-700 dark:text-emerald-200">
                              <ChevronRight className="h-3 w-3 inline mr-1" />
                              Test filters before setting queue
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Phone Validation Warning */}
                  <div 
                    className="p-4 rounded-lg border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 transition-opacity hover:opacity-95"
                  >
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2 text-xs text-orange-900 dark:text-orange-100">
                        <p className="font-bold">Phone Validation Filter</p>
                        <p>Contacts are automatically filtered during queue setting:</p>
                        <ul className="space-y-1 list-disc list-inside text-orange-800 dark:text-orange-200 mt-1">
                          <li>Must have Contact Phone, Mobile, or HQ Phone</li>
                          <li>HQ Phone requires country match with contact</li>
                          <li>Invalid/missing phones are excluded</li>
                        </ul>
                        <p className="font-semibold mt-2">Tip: If getting fewer contacts than expected, many may lack valid phone numbers</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>

            <AlertDialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between w-full">
                <div className="text-sm text-muted-foreground">
                  {filterGroup?.conditions && filterGroup.conditions.length > 0 ? (
                    <span>Filters configured and ready to apply</span>
                  ) : (
                    <span>No filters configured - will queue all campaign contacts</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <AlertDialogCancel disabled={isPending} data-testid="button-cancel-replace" className="h-9">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => replaceQueueMutation.mutate()}
                    disabled={isPending}
                    data-testid="button-confirm-replace"
                    className="h-9"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Set Queue
                  </AlertDialogAction>
                </div>
              </div>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear My Queue Dialog */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear My Queue</AlertDialogTitle>
              <AlertDialogDescription>
                This will release all queued and locked items from your queue. Items currently in progress will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending} data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => clearQueueMutation.mutate()}
                disabled={isPending}
                data-testid="button-confirm-clear"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Clear Queue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear All Queues Dialog (Admin Only) */}
        <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear All Queues (Admin)</AlertDialogTitle>
              <AlertDialogDescription>
                This will release all queued and locked items from ALL agent queues in this campaign. 
                This action affects all agents and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending} data-testid="button-cancel-clear-all">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => clearAllQueuesMutation.mutate()}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-clear-all"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Clear All Queues
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  };

  // Compact mode for header
  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2">
          {/* Custom queue controls disabled — unified intelligent queue system active */}
          <Badge variant="secondary" className="bg-white/10 text-white border-white/20" data-testid="badge-unified-queue">
            <Lightbulb className="h-3 w-3 mr-1.5" />
            Intelligent Queue
          </Badge>
          
          {isLoadingStats ? (
            <Loader2 className="h-4 w-4 animate-spin text-white ml-2" data-testid="loader-queue-stats" />
          ) : stats && (
            <Badge variant="secondary" className="bg-white/10 text-white border-white/20 ml-2" data-testid="badge-queued">
              {stats.queued} in queue
            </Badge>
          )}
        </div>
      </>
    );
  }

  // Full Card mode for sidebar/dedicated section
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Unified Intelligent Queue
              </CardTitle>
              <CardDescription>
                Contacts are automatically prioritized by the intelligent scoring engine.
                Queue distribution, tracking, and release are managed centrally for both human and AI agents.
              </CardDescription>
            </div>
            {isLoadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin" data-testid="loader-queue-stats" />
            ) : stats && (
              <div className="flex gap-2">
                <Badge variant="secondary" data-testid="badge-queued">Queued: {stats.queued}</Badge>
                <Badge variant="secondary" data-testid="badge-in-progress">In Progress: {stats.in_progress}</Badge>
                <Badge variant="outline" data-testid="badge-total">Total: {stats.total}</Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Custom queue filters have been replaced by the unified intelligent queue system.
            Contacts are scored and prioritized automatically based on industry fit, role fit, account fit, intent topics, and historical conversion data.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
