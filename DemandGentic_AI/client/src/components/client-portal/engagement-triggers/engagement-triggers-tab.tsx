/**
 * Engagement Triggers Tab — Visual Flow UI
 *
 * Beautiful cross-channel automation dashboard with visual flow connections.
 * Call engagements → Email follow-ups | Email engagements → Call follow-ups
 *
 * Features:
 * - Animated SVG flow visualization
 * - Visual trigger flow cards with connection lines
 * - Interactive channel nodes
 * - Gradient stat cards
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Zap, Phone, Mail, Clock, CheckCircle, AlertCircle, XCircle,
  ArrowRight, RefreshCw, Plus, Filter, ChevronLeft, ChevronRight,
  TrendingUp, Activity, Ban, Loader2, Sparkles, ArrowRightLeft,
  Target, Send, PhoneCall, MailOpen, Timer, Shield, Eye,
  MousePointerClick, CircleDot, Workflow, GitBranch
} from 'lucide-react';

// ==================== TYPES ====================

interface PipelineLeadView {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  accountName: string | null;
  accountId: string | null;
  campaignName: string | null;
  campaignId: string | null;
  aiScore: string | null;
  disposition: string | null;
  lastEngagementChannel: 'call' | 'email' | null;
  lastEngagementAt: string | null;
  nextAction: 'call' | 'email' | null;
  triggerStatus: string | null;
  triggerId: string | null;
  createdAt: string | null;
}

interface EngagementTrigger {
  id: string;
  accountId: string;
  contactId: string;
  campaignId: string | null;
  sourceChannel: 'call' | 'email';
  targetChannel: 'call' | 'email';
  status: string;
  scheduledAt: string | null;
  executedAt: string | null;
  createdAt: string;
  triggerPayload: Record | null;
}

interface EngagementStats {
  totalTriggers: number;
  pending: number;
  scheduled: number;
  completed: number;
  failed: number;
  cancelled: number;
  callToEmail: number;
  emailToCall: number;
}

interface EngagementTriggersTabProps {
  authHeaders: { headers: { Authorization: string } };
  clientAccountId?: string;
}

// ==================== HELPERS ====================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins  = {
  pending:    { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  scheduled:  { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  executing:  { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  completed:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  failed:     { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  cancelled:  { bg: 'bg-gray-50 dark:bg-gray-950/30', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', dot: 'bg-gray-400' },
  skipped:    { bg: 'bg-gray-50 dark:bg-gray-950/30', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', dot: 'bg-gray-400' },
};

// ==================== ANIMATED FLOW VISUALIZATION ====================

function CrossChannelFlowHero({ stats, isLoading }: { stats: EngagementStats; isLoading: boolean }) {
  const callToEmailPct = stats.totalTriggers > 0
    ? Math.round((stats.callToEmail / stats.totalTriggers) * 100) : 50;
  const emailToCallPct = 100 - callToEmailPct;

  return (
    
      {/* Background decoration */}
      
        
        
      

      
        {/* Title */}
        
          
            
          
          
            Engagement Triggers
            Cross-channel automation flow
          
        

        {/* Visual Flow */}
        
          {/* Call Node */}
          
            
              
              
                
              
              
                
              
            
            Voice Call
            Engagement source
          

          {/* Connection: Call → Email */}
          
            
              
                {isLoading ? '—' : stats.callToEmail}
              
            
            
              
                
                  
                    
                    
                  
                
                
                
              
            
            Call → Email
          

          {/* Center Hub */}
          
            
            
              
            
            
              AI Engine
            
          

          {/* Connection: Email → Call */}
          
            
              
                {isLoading ? '—' : stats.emailToCall}
              
            
            
              
                
                  
                    
                    
                  
                
                
                
              
            
            Email → Call
          

          {/* Email Node */}
          
            
              
              
                
              
              
                
              
            
            Email
            Engagement source
          
        
      

      {/* CSS for animated dashes */}
      {`
        @keyframes dash {
          to { stroke-dashoffset: -20; }
        }
      `}
    
  );
}

// ==================== STAT MINI CARDS ====================

function StatCards({ stats, isLoading }: { stats: EngagementStats; isLoading: boolean }) {
  const completionRate = stats.totalTriggers > 0
    ? Math.round((stats.completed / stats.totalTriggers) * 100) : 0;

  const cards = [
    {
      label: 'Total Triggers',
      value: stats.totalTriggers,
      icon: Activity,
      gradient: 'from-slate-500 to-slate-700',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-300',
    },
    {
      label: 'Scheduled',
      value: stats.scheduled + stats.pending,
      icon: Timer,
      gradient: 'from-blue-500 to-blue-700',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle,
      gradient: 'from-emerald-500 to-emerald-700',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      extra: completionRate > 0 ? `${completionRate}%` : undefined,
    },
    {
      label: 'Failed',
      value: stats.failed,
      icon: AlertCircle,
      gradient: 'from-red-500 to-red-700',
      iconBg: 'bg-red-100 dark:bg-red-900/50',
      iconColor: 'text-red-600 dark:text-red-400',
    },
  ];

  return (
    
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          
            
              
                {card.label}
                
                  
                    {isLoading ?  : card.value}
                  
                  {card.extra && (
                    {card.extra}
                  )}
                
              
              
                
              
            
          
        );
      })}
    
  );
}

// ==================== VISUAL TRIGGER FLOW CARD ====================

function TriggerFlowCard({
  trigger,
  onCancel,
  isCancelling,
}: {
  trigger: EngagementTrigger;
  onCancel: (id: string) => void;
  isCancelling: boolean;
}) {
  const style = STATUS_STYLES[trigger.status] ?? STATUS_STYLES.pending;
  const priority = (trigger.triggerPayload as any)?.priority ?? 'normal';
  const isActive = trigger.status === 'pending' || trigger.status === 'scheduled';

  return (
    
      {/* Flow visualization */}
      
        {/* Source channel node */}
        
          {trigger.sourceChannel === 'call'
            ? 
            : 
          }
        

        {/* Animated connection line */}
        
          
            
              
                
                
              
            
            
            
          
          {/* Status dot on the line */}
          
            
          
        

        {/* Target channel node */}
        
          {trigger.targetChannel === 'call'
            ? 
            : 
          }
        
      

      {/* Info row */}
      
        
          
            
            {trigger.status.charAt(0).toUpperCase() + trigger.status.slice(1)}
          
          {priority !== 'normal' && (
            
              {priority}
            
          )}
        
        
          {trigger.scheduledAt && (
            
              
                
                  
                  {formatRelativeTime(trigger.scheduledAt)}
                
                {formatDate(trigger.scheduledAt)}
              
            
          )}
          {isActive && (
             onCancel(trigger.id)}
            >
              
              Cancel
            
          )}
        
      
    
  );
}

// ==================== VISUAL LEAD CARD ====================

function LeadFlowCard({
  lead,
  onTrigger,
  onCancel,
  isCancelling,
}: {
  lead: PipelineLeadView;
  onTrigger: (lead: PipelineLeadView) => void;
  onCancel: (triggerId: string) => void;
  isCancelling: boolean;
}) {
  const isActive = lead.triggerStatus === 'pending' || lead.triggerStatus === 'scheduled';
  const statusStyle = lead.triggerStatus ? (STATUS_STYLES[lead.triggerStatus] ?? STATUS_STYLES.pending) : null;

  return (
    
      {/* Header */}
      
        
          {lead.contactName || 'Unknown Contact'}
          {lead.accountName || 'No account'}
        
        {lead.aiScore && (
          
            
              
                
                  
                  {lead.aiScore}
                
              
              AI Lead Score
            
          
        )}
      

      {/* Campaign tag */}
      {lead.campaignName && (
        
          
            
            {lead.campaignName}
          
        
      )}

      {/* Flow visualization */}
      
        {/* Last engagement */}
        
          {lead.lastEngagementChannel === 'call'
            ? 
            : lead.lastEngagementChannel === 'email'
            ? 
            : 
          }
        

        {/* Connection */}
        
          
          {lead.nextAction && (
            
              
            
          )}
        

        {/* Next action */}
        
          {lead.nextAction === 'call'
            ? 
            : lead.nextAction === 'email'
            ? 
            : 
          }
        
      

      {/* Labels under flow */}
      
        
          {lead.lastEngagementChannel
            ? `Last: ${lead.lastEngagementChannel}`
            : 'No engagement'}
        
        
          {lead.nextAction ? `Next: ${lead.nextAction}` : 'No action set'}
        
      

      {/* Footer: Status + Actions */}
      
        {statusStyle ? (
          
            
            {lead.triggerStatus!.charAt(0).toUpperCase() + lead.triggerStatus!.slice(1)}
          
        ) : (
          No trigger
        )}

        
          {lead.triggerId && isActive && (
             onCancel(lead.triggerId!)}
            >
              Cancel
            
          )}
           onTrigger(lead)}
          >
            
            Trigger
          
        
      
    
  );
}

// ==================== CREATE TRIGGER DIALOG (VISUAL) ====================

function CreateTriggerDialog({
  open,
  lead,
  isPending,
  onSubmit,
  onClose,
}: {
  open: boolean;
  lead: PipelineLeadView | null;
  isPending: boolean;
  onSubmit: (targetChannel: 'call' | 'email') => void;
  onClose: () => void;
}) {
  const [targetChannel, setTargetChannel] = useState('email');

  const sourceChannel = targetChannel === 'email' ? 'call' : 'email';

  return (
     { if (!v) onClose(); }}>
      
        
          
            
              
            
            Create Engagement Trigger
          
        

        {lead && (
          
            {/* Lead info */}
            
              
                
                  {(lead.contactName || '?')[0].toUpperCase()}
                
                
                  {lead.contactName || 'Unknown Contact'}
                  {lead.accountName || 'No account'} {lead.contactEmail ? `· ${lead.contactEmail}` : ''}
                
              
            

            {/* Channel selector */}
            
              Select Next Action
              
                 setTargetChannel('email')}
                >
                  
                    
                  
                  Send Email
                  Follow-up email
                  {targetChannel === 'email' && (
                    
                      
                    
                  )}
                
                 setTargetChannel('call')}
                >
                  
                    
                  
                  Schedule Call
                  Voice follow-up
                  {targetChannel === 'call' && (
                    
                      
                    
                  )}
                
              
            

            {/* Flow preview */}
            
              
                {sourceChannel === 'call'
                  ? 
                  : 
                }
              
              
                
                
                
              
              
                {targetChannel === 'call'
                  ? 
                  : 
                }
              
            
            
              {sourceChannel === 'call' ? 'Voice Call' : 'Email'} engagement → AI-scheduled {targetChannel === 'call' ? 'Voice Call' : 'Email'} follow-up
            

            

            
              
                Cancel
              
               onSubmit(targetChannel)}
                disabled={isPending}
                className={targetChannel === 'call'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                }
              >
                {isPending && }
                
                Create Trigger
              
            
          
        )}
      
    
  );
}

// ==================== MAIN COMPONENT ====================

export function EngagementTriggersTab({ authHeaders, clientAccountId }: EngagementTriggersTabProps) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [triggerPage, setTriggerPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const pageSize = 24;

  // ==================== QUERIES ====================

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['engagement-stats', clientAccountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      const res = await fetch(`/api/engagement-triggers/stats?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['engagement-pipeline-leads', clientAccountId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      const res = await fetch(`/api/engagement-triggers/pipeline-leads?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: triggersData, isLoading: triggersLoading } = useQuery({
    queryKey: ['engagement-triggers-list', clientAccountId, triggerPage, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(triggerPage), pageSize: String(pageSize) });
      if (clientAccountId) params.set('clientAccountId', clientAccountId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/engagement-triggers?${params}`, authHeaders);
      if (!res.ok) throw new Error('Failed to fetch triggers');
      return res.json();
    },
    staleTime: 30_000,
  });

  // ==================== MUTATIONS ====================

  const cancelMutation = useMutation({
    mutationFn: async (triggerId: string) => {
      const res = await fetch(`/api/engagement-triggers/${triggerId}/cancel`, {
        method: 'PATCH',
        ...authHeaders,
      });
      if (!res.ok) throw new Error('Failed to cancel trigger');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Trigger cancelled' });
      queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      accountId: string;
      contactId: string;
      campaignId?: string;
      targetChannel: 'call' | 'email';
    }) => {
      const res = await fetch('/api/engagement-triggers', {
        method: 'POST',
        headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create trigger');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Engagement trigger created' });
      setCreateDialogOpen(false);
      setSelectedLead(null);
      queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Creation failed', description: err.message, variant: 'destructive' });
    },
  });

  // ==================== COMPUTED ====================

  const stats = statsData ?? { totalTriggers: 0, pending: 0, scheduled: 0, completed: 0, failed: 0, cancelled: 0, callToEmail: 0, emailToCall: 0 };
  const totalLeads = leadsData?.total ?? 0;
  const totalPages = Math.ceil(totalLeads / pageSize);
  const totalTriggerPages = Math.ceil((triggersData?.total ?? 0) / pageSize);

  return (
    
      {/* Hero Flow Visualization */}
      

      {/* Stat Cards */}
      

      {/* Tabs */}
      
        
          
            
              
              Pipeline Leads
              {totalLeads > 0 && (
                {totalLeads}
              )}
            
            
              
              Trigger Flow
              {stats.totalTriggers > 0 && (
                {stats.totalTriggers}
              )}
            
          

           {
              queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
              queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
              queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
            }}
          >
            
            Refresh
          
        

        {/* ==================== LEADS TAB ==================== */}
        
          {leadsLoading ? (
            
              {Array.from({ length: 6 }).map((_, i) => (
                
              ))}
            
          ) : (leadsData?.leads?.length ?? 0) === 0 ? (
            
              
                
              
              No qualified leads yet
              
                Leads will appear here as campaigns generate qualified engagements and trigger cross-channel follow-ups
              
            
          ) : (
            <>
              
                {leadsData!.leads.map((lead) => (
                   {
                      setSelectedLead(l);
                      setCreateDialogOpen(true);
                    }}
                    onCancel={(id) => cancelMutation.mutate(id)}
                    isCancelling={cancelMutation.isPending}
                  />
                ))}
              

              {/* Pagination */}
              {totalPages > 1 && (
                
                  
                    Page {page} of {totalPages} ({totalLeads} leads)
                  
                  
                     setPage((p) => Math.max(1, p - 1))}
                    >
                      
                    
                    = totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      
                    
                  
                
              )}
            
          )}
        

        {/* ==================== TRIGGERS TAB ==================== */}
        
          {/* Filter bar */}
          
             { setStatusFilter(v); setTriggerPage(1); }}>
              
                
                
              
              
                All Statuses
                Pending
                Scheduled
                Executing
                Completed
                Failed
                Cancelled
              
            
            
              {triggersData?.total ?? 0} triggers
            
          

          {triggersLoading ? (
            
              {Array.from({ length: 4 }).map((_, i) => (
                
              ))}
            
          ) : (triggersData?.triggers?.length ?? 0) === 0 ? (
            
              
                
              
              No triggers found
              
                Triggers are auto-created when engagements occur across channels
              
            
          ) : (
            <>
              
                {triggersData!.triggers.map((trigger) => (
                   cancelMutation.mutate(id)}
                    isCancelling={cancelMutation.isPending}
                  />
                ))}
              

              {/* Pagination */}
              {totalTriggerPages > 1 && (
                
                  
                    Page {triggerPage} of {totalTriggerPages}
                  
                  
                     setTriggerPage((p) => Math.max(1, p - 1))}
                    >
                      
                    
                    = totalTriggerPages}
                      onClick={() => setTriggerPage((p) => p + 1)}
                    >
                      
                    
                  
                
              )}
            
          )}
        
      

      {/* Create Trigger Dialog */}
       {
          if (!selectedLead?.accountId || !selectedLead?.id) return;
          createMutation.mutate({
            accountId: selectedLead.accountId,
            contactId: selectedLead.id,
            campaignId: selectedLead.campaignId ?? undefined,
            targetChannel,
          });
        }}
        onClose={() => { setCreateDialogOpen(false); setSelectedLead(null); }}
      />
    
  );
}