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
  triggerPayload: Record<string, unknown> | null;
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
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
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
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6 md:p-8">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-gradient-to-br from-amber-500/5 to-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Engagement Triggers</h2>
            <p className="text-sm text-muted-foreground">Cross-channel automation flow</p>
          </div>
        </div>

        {/* Visual Flow */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-0 py-4">
          {/* Call Node */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 shadow-xl shadow-green-500/20 transition-transform group-hover:scale-105">
                <PhoneCall className="h-9 w-9 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 border-green-400 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
            <span className="text-sm font-semibold">Voice Call</span>
            <span className="text-xs text-muted-foreground">Engagement source</span>
          </div>

          {/* Connection: Call → Email */}
          <div className="flex flex-col items-center md:mx-2 flex-1 max-w-[200px]">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs font-mono gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                {isLoading ? '—' : stats.callToEmail}
              </Badge>
            </div>
            <div className="relative w-full h-8 flex items-center">
              <svg className="w-full h-8" viewBox="0 0 200 32" fill="none">
                <defs>
                  <linearGradient id="flowGradient1" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgb(34,197,94)" />
                    <stop offset="100%" stopColor="rgb(59,130,246)" />
                  </linearGradient>
                </defs>
                <path d="M 0 16 C 50 16, 50 8, 100 8 C 150 8, 150 16, 200 16" stroke="url(#flowGradient1)" strokeWidth="2" strokeDasharray="6 4" className="animate-[dash_2s_linear_infinite]" />
                <polygon points="190,12 200,16 190,20" fill="rgb(59,130,246)" />
              </svg>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Call → Email</span>
          </div>

          {/* Center Hub */}
          <div className="relative flex items-center justify-center w-16 h-16 md:mx-2">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-400 to-purple-500 rounded-full blur-lg opacity-20" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
              <ArrowRightLeft className="h-6 w-6 text-white" />
            </div>
            <div className="absolute -bottom-5 whitespace-nowrap">
              <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest">AI Engine</span>
            </div>
          </div>

          {/* Connection: Email → Call */}
          <div className="flex flex-col items-center md:mx-2 flex-1 max-w-[200px]">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs font-mono gap-1 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                {isLoading ? '—' : stats.emailToCall}
              </Badge>
            </div>
            <div className="relative w-full h-8 flex items-center">
              <svg className="w-full h-8" viewBox="0 0 200 32" fill="none">
                <defs>
                  <linearGradient id="flowGradient2" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="rgb(59,130,246)" />
                    <stop offset="100%" stopColor="rgb(34,197,94)" />
                  </linearGradient>
                </defs>
                <path d="M 0 16 C 50 16, 50 24, 100 24 C 150 24, 150 16, 200 16" stroke="url(#flowGradient2)" strokeWidth="2" strokeDasharray="6 4" className="animate-[dash_2s_linear_infinite]" />
                <polygon points="190,12 200,16 190,20" fill="rgb(34,197,94)" />
              </svg>
            </div>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Email → Call</span>
          </div>

          {/* Email Node */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 shadow-xl shadow-blue-500/20 transition-transform group-hover:scale-105">
                <MailOpen className="h-9 w-9 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-400 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              </div>
            </div>
            <span className="text-sm font-semibold">Email</span>
            <span className="text-xs text-muted-foreground">Engagement source</span>
          </div>
        </div>
      </div>

      {/* CSS for animated dashes */}
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -20; }
        }
      `}</style>
    </div>
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="group relative rounded-xl border bg-card p-4 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{card.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold tabular-nums">
                    {isLoading ? <Skeleton className="h-7 w-12 inline-block" /> : card.value}
                  </p>
                  {card.extra && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{card.extra}</span>
                  )}
                </div>
              </div>
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${card.iconBg} transition-transform group-hover:scale-110`}>
                <Icon className={`h-4.5 w-4.5 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
    <div className={`group relative rounded-xl border ${style.border} ${style.bg} p-4 transition-all duration-200 hover:shadow-md`}>
      {/* Flow visualization */}
      <div className="flex items-center gap-3 mb-3">
        {/* Source channel node */}
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl shadow-sm ${
          trigger.sourceChannel === 'call'
            ? 'bg-gradient-to-br from-green-400 to-emerald-500'
            : 'bg-gradient-to-br from-blue-400 to-indigo-500'
        }`}>
          {trigger.sourceChannel === 'call'
            ? <Phone className="h-4.5 w-4.5 text-white" />
            : <Mail className="h-4.5 w-4.5 text-white" />
          }
        </div>

        {/* Animated connection line */}
        <div className="flex-1 relative h-8 flex items-center">
          <svg className="w-full h-8" viewBox="0 0 120 32" fill="none" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`tg-${trigger.id}`} x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={trigger.sourceChannel === 'call' ? 'rgb(34,197,94)' : 'rgb(59,130,246)'} />
                <stop offset="100%" stopColor={trigger.targetChannel === 'call' ? 'rgb(34,197,94)' : 'rgb(59,130,246)'} />
              </linearGradient>
            </defs>
            <line x1="0" y1="16" x2="120" y2="16"
              stroke={`url(#tg-${trigger.id})`}
              strokeWidth="2"
              strokeDasharray={isActive ? '6 4' : '0'}
              className={isActive ? 'animate-[dash_2s_linear_infinite]' : ''}
              strokeOpacity={trigger.status === 'completed' ? 1 : 0.6}
            />
            <polygon points="112,12 120,16 112,20" fill={trigger.targetChannel === 'call' ? 'rgb(34,197,94)' : 'rgb(59,130,246)'} />
          </svg>
          {/* Status dot on the line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${style.dot} ${isActive ? 'animate-pulse' : ''} ring-2 ring-white dark:ring-slate-900`} />
          </div>
        </div>

        {/* Target channel node */}
        <div className={`flex items-center justify-center w-10 h-10 rounded-xl shadow-sm ${
          trigger.targetChannel === 'call'
            ? 'bg-gradient-to-br from-green-400 to-emerald-500'
            : 'bg-gradient-to-br from-blue-400 to-indigo-500'
        }`}>
          {trigger.targetChannel === 'call'
            ? <Phone className="h-4.5 w-4.5 text-white" />
            : <Mail className="h-4.5 w-4.5 text-white" />
          }
        </div>
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text} border ${style.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {trigger.status.charAt(0).toUpperCase() + trigger.status.slice(1)}
          </span>
          {priority !== 'normal' && (
            <Badge variant={priority === 'high' ? 'destructive' : 'outline'} className="text-[10px] h-5">
              {priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {trigger.scheduledAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(trigger.scheduledAt)}
                </TooltipTrigger>
                <TooltipContent>{formatDate(trigger.scheduledAt)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-muted-foreground hover:text-destructive px-2"
              disabled={isCancelling}
              onClick={() => onCancel(trigger.id)}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
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
    <div className="group relative rounded-xl border bg-card p-4 hover:shadow-md transition-all duration-200 hover:border-primary/20">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold truncate">{lead.contactName || 'Unknown Contact'}</h4>
          <p className="text-xs text-muted-foreground truncate">{lead.accountName || 'No account'}</p>
        </div>
        {lead.aiScore && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-medium">
                  <Sparkles className="h-3 w-3" />
                  {lead.aiScore}
                </div>
              </TooltipTrigger>
              <TooltipContent>AI Lead Score</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Campaign tag */}
      {lead.campaignName && (
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
            <Target className="h-3 w-3" />
            <span className="truncate max-w-[180px]">{lead.campaignName}</span>
          </span>
        </div>
      )}

      {/* Flow visualization */}
      <div className="flex items-center gap-2 mb-3 px-1">
        {/* Last engagement */}
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          lead.lastEngagementChannel === 'call'
            ? 'bg-green-100 dark:bg-green-900/30'
            : lead.lastEngagementChannel === 'email'
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : 'bg-muted'
        }`}>
          {lead.lastEngagementChannel === 'call'
            ? <Phone className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            : lead.lastEngagementChannel === 'email'
            ? <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            : <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>

        {/* Connection */}
        <div className="flex-1 flex items-center h-6 relative">
          <div className={`absolute inset-x-0 top-1/2 h-px ${
            lead.nextAction ? 'bg-gradient-to-r from-muted-foreground/30 to-primary/40' : 'bg-muted-foreground/20'
          }`} />
          {lead.nextAction && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-card px-1">
              <ArrowRight className="h-3 w-3 text-primary/60" />
            </div>
          )}
        </div>

        {/* Next action */}
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          lead.nextAction === 'call'
            ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-400/30'
            : lead.nextAction === 'email'
            ? 'bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-400/30'
            : 'bg-muted border border-dashed border-muted-foreground/20'
        }`}>
          {lead.nextAction === 'call'
            ? <Phone className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            : lead.nextAction === 'email'
            ? <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            : <Plus className="h-3 w-3 text-muted-foreground/50" />
          }
        </div>
      </div>

      {/* Labels under flow */}
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-[10px] text-muted-foreground">
          {lead.lastEngagementChannel
            ? `Last: ${lead.lastEngagementChannel}`
            : 'No engagement'}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {lead.nextAction ? `Next: ${lead.nextAction}` : 'No action set'}
        </span>
      </div>

      {/* Footer: Status + Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-dashed">
        {statusStyle ? (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} ${isActive ? 'animate-pulse' : ''}`} />
            {lead.triggerStatus!.charAt(0).toUpperCase() + lead.triggerStatus!.slice(1)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">No trigger</span>
        )}

        <div className="flex items-center gap-1">
          {lead.triggerId && isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
              disabled={isCancelling}
              onClick={() => onCancel(lead.triggerId!)}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1 hover:bg-primary hover:text-primary-foreground"
            onClick={() => onTrigger(lead)}
          >
            <Zap className="h-3 w-3" />
            Trigger
          </Button>
        </div>
      </div>
    </div>
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
  const [targetChannel, setTargetChannel] = useState<'call' | 'email'>('email');

  const sourceChannel = targetChannel === 'email' ? 'call' : 'email';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Zap className="h-4 w-4 text-white" />
            </div>
            Create Engagement Trigger
          </DialogTitle>
        </DialogHeader>

        {lead && (
          <div className="space-y-5">
            {/* Lead info */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 text-white font-bold text-sm">
                  {(lead.contactName || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm">{lead.contactName || 'Unknown Contact'}</p>
                  <p className="text-xs text-muted-foreground">{lead.accountName || 'No account'} {lead.contactEmail ? `· ${lead.contactEmail}` : ''}</p>
                </div>
              </div>
            </div>

            {/* Channel selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Next Action</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`relative rounded-xl border-2 p-4 text-center transition-all ${
                    targetChannel === 'email'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md shadow-blue-500/10'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                  onClick={() => setTargetChannel('email')}
                >
                  <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                    targetChannel === 'email'
                      ? 'bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg shadow-blue-500/20'
                      : 'bg-muted'
                  }`}>
                    <Mail className={`h-5 w-5 ${targetChannel === 'email' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <p className="text-sm font-medium">Send Email</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Follow-up email</p>
                  {targetChannel === 'email' && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  className={`relative rounded-xl border-2 p-4 text-center transition-all ${
                    targetChannel === 'call'
                      ? 'border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md shadow-green-500/10'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                  onClick={() => setTargetChannel('call')}
                >
                  <div className={`mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
                    targetChannel === 'call'
                      ? 'bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/20'
                      : 'bg-muted'
                  }`}>
                    <Phone className={`h-5 w-5 ${targetChannel === 'call' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <p className="text-sm font-medium">Schedule Call</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Voice follow-up</p>
                  {targetChannel === 'call' && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Flow preview */}
            <div className="flex items-center justify-center gap-3 py-2">
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                sourceChannel === 'call' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {sourceChannel === 'call'
                  ? <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                  : <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                }
              </div>
              <div className="flex items-center gap-1">
                <div className="w-8 h-px bg-muted-foreground/30" />
                <Zap className="h-4 w-4 text-amber-500" />
                <div className="w-8 h-px bg-muted-foreground/30" />
              </div>
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg ring-2 ${
                targetChannel === 'call'
                  ? 'bg-green-100 dark:bg-green-900/30 ring-green-400/40'
                  : 'bg-blue-100 dark:bg-blue-900/30 ring-blue-400/40'
              }`}>
                {targetChannel === 'call'
                  ? <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                  : <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                }
              </div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              {sourceChannel === 'call' ? 'Voice Call' : 'Email'} engagement → AI-scheduled {targetChannel === 'call' ? 'Voice Call' : 'Email'} follow-up
            </p>

            <Separator />

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => onSubmit(targetChannel)}
                disabled={isPending}
                className={targetChannel === 'call'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                }
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Zap className="h-4 w-4 mr-1" />
                Create Trigger
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN COMPONENT ====================

export function EngagementTriggersTab({ authHeaders, clientAccountId }: EngagementTriggersTabProps) {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [triggerPage, setTriggerPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<PipelineLeadView | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const pageSize = 24;

  // ==================== QUERIES ====================

  const { data: statsData, isLoading: statsLoading } = useQuery<EngagementStats>({
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

  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ leads: PipelineLeadView[]; total: number }>({
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

  const { data: triggersData, isLoading: triggersLoading } = useQuery<{ triggers: EngagementTrigger[]; total: number }>({
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
    <div className="space-y-6">
      {/* Hero Flow Visualization */}
      <CrossChannelFlowHero stats={stats} isLoading={statsLoading} />

      {/* Stat Cards */}
      <StatCards stats={stats} isLoading={statsLoading} />

      {/* Tabs */}
      <Tabs defaultValue="leads" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="leads" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
              <GitBranch className="h-3.5 w-3.5" />
              Pipeline Leads
              {totalLeads > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 text-[10px] font-mono">{totalLeads}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="triggers" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
              <Workflow className="h-3.5 w-3.5" />
              Trigger Flow
              {stats.totalTriggers > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 text-[10px] font-mono">{stats.totalTriggers}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['engagement-pipeline-leads'] });
              queryClient.invalidateQueries({ queryKey: ['engagement-triggers-list'] });
              queryClient.invalidateQueries({ queryKey: ['engagement-stats'] });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* ==================== LEADS TAB ==================== */}
        <TabsContent value="leads" className="mt-0">
          {leadsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : (leadsData?.leads?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
                <TrendingUp className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-muted-foreground">No qualified leads yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Leads will appear here as campaigns generate qualified engagements and trigger cross-channel follow-ups
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {leadsData!.leads.map((lead) => (
                  <LeadFlowCard
                    key={lead.id}
                    lead={lead}
                    onTrigger={(l) => {
                      setSelectedLead(l);
                      setCreateDialogOpen(true);
                    }}
                    onCancel={(id) => cancelMutation.mutate(id)}
                    isCancelling={cancelMutation.isPending}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {totalPages} ({totalLeads} leads)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ==================== TRIGGERS TAB ==================== */}
        <TabsContent value="triggers" className="mt-0">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setTriggerPage(1); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="executing">Executing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {triggersData?.total ?? 0} triggers
            </span>
          </div>

          {triggersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : (triggersData?.triggers?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted mb-4">
                <Workflow className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-muted-foreground">No triggers found</p>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Triggers are auto-created when engagements occur across channels
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {triggersData!.triggers.map((trigger) => (
                  <TriggerFlowCard
                    key={trigger.id}
                    trigger={trigger}
                    onCancel={(id) => cancelMutation.mutate(id)}
                    isCancelling={cancelMutation.isPending}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalTriggerPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {triggerPage} of {totalTriggerPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={triggerPage <= 1}
                      onClick={() => setTriggerPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={triggerPage >= totalTriggerPages}
                      onClick={() => setTriggerPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Trigger Dialog */}
      <CreateTriggerDialog
        open={createDialogOpen}
        lead={selectedLead}
        isPending={createMutation.isPending}
        onSubmit={(targetChannel) => {
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
    </div>
  );
}
