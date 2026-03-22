/**
 * Engagement Timeline — Visual timeline for trigger lifecycle.
 *
 * Shows: Source engagement → Trigger created → Scheduled → Executed → Outcome
 * Each step shows actual data from calls/emails with contextual details.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Phone, Mail, Zap, Clock, CheckCircle2, XCircle, AlertCircle,
  ArrowRight, FileText, MessageSquare, MousePointerClick,
  MailOpen, PhoneCall, Timer, User, Building2, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  type: string;
  channel?: string;
  timestamp: string;
  details: Record<string, any>;
}

interface TriggerTimelineData {
  trigger: {
    id: string;
    sourceChannel: string;
    targetChannel: string;
    status: string;
    createdAt: string;
    scheduledAt: string | null;
    executedAt: string | null;
    triggerPayload: Record<string, any> | null;
    resultNotes: string | null;
    errorMessage: string | null;
  };
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
  } | null;
  account: {
    name: string | null;
    website: string | null;
  } | null;
  timeline: TimelineEvent[];
}

interface EngagementTimelineProps {
  triggerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authHeaders: { headers: { Authorization: string } };
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

const STEP_ICON_MAP: Record<string, { icon: typeof Phone; color: string; bg: string }> = {
  source_engagement: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  trigger_created: { icon: ArrowRight, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/40' },
  scheduled: { icon: Timer, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  executed: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/40' },
};

function TimelineStep({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = STEP_ICON_MAP[event.type] || STEP_ICON_MAP.source_engagement;
  const Icon = config.icon;
  const details = event.details || {};

  // Format the step title
  const title = (() => {
    switch (event.type) {
      case 'source_engagement':
        return event.channel === 'call' ? 'Call Engagement' : 'Email Engagement';
      case 'trigger_created':
        return `Trigger: ${details.targetChannel === 'call' ? 'Schedule Call' : 'Send Email'}`;
      case 'scheduled':
        return 'Scheduled for Execution';
      case 'executed':
        return event.channel === 'email' ? 'Email Delivered' : 'Call Queued';
      case 'failed':
        return 'Execution Failed';
      default:
        return event.type;
    }
  })();

  // Check if there's expandable details
  const hasDetails = (
    (event.type === 'source_engagement' && (details.disposition || details.transcriptPreview || details.events)) ||
    (event.type === 'trigger_created' && details.payload) ||
    (event.type === 'executed' && details.notes) ||
    (event.type === 'failed' && details.error)
  );

  return (
    <div className="flex gap-3">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', config.bg)}>
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/60 min-h-[24px]" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-5', isLast && 'pb-0')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {event.channel && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5">
                {event.channel === 'call' ? <Phone className="h-2.5 w-2.5" /> : <Mail className="h-2.5 w-2.5" />}
                {event.channel}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">{formatTime(event.timestamp)}</span>
        </div>

        {/* Inline details summary */}
        {event.type === 'source_engagement' && details.type === 'call' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {details.disposition && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" /> {details.disposition.replace(/_/g, ' ')}
              </span>
            )}
            {details.durationSeconds && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDuration(details.durationSeconds)}
              </span>
            )}
            {details.connected && (
              <span className="flex items-center gap-1 text-emerald-600">
                <PhoneCall className="h-3 w-3" /> Connected
              </span>
            )}
            {details.campaignName && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {details.campaignName}
              </span>
            )}
          </div>
        )}

        {event.type === 'source_engagement' && details.type === 'email' && details.events && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {details.events.map((e: any, i: number) => (
              <span key={i} className="flex items-center gap-1">
                {e.type === 'clicked' ? <MousePointerClick className="h-3 w-3 text-blue-500" /> :
                 e.type === 'opened' ? <MailOpen className="h-3 w-3 text-amber-500" /> :
                 <Mail className="h-3 w-3" />}
                {e.type}
              </span>
            ))}
            {details.campaignName && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" /> {details.campaignName}
              </span>
            )}
          </div>
        )}

        {event.type === 'trigger_created' && details.payload && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            {(details.payload as any)?.priority && (details.payload as any).priority !== 'normal' && (
              <Badge variant={(details.payload as any).priority === 'high' ? 'destructive' : 'outline'} className="text-[10px] h-4">
                {(details.payload as any).priority}
              </Badge>
            )}
            {(details.payload as any)?.callObjective && (
              <span className="text-xs italic">"{(details.payload as any).callObjective}"</span>
            )}
          </div>
        )}

        {event.type === 'executed' && details.notes && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{details.notes}</p>
        )}

        {event.type === 'failed' && details.error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{details.error}</p>
        )}

        {/* Expandable transcript preview */}
        {hasDetails && details.transcriptPreview && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Hide' : 'Show'} transcript
            </button>
            {expanded && (
              <div className="mt-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {details.transcriptPreview}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EngagementTimelineSheet({
  triggerId,
  open,
  onOpenChange,
  authHeaders,
}: EngagementTimelineProps) {
  const { data, isLoading } = useQuery<TriggerTimelineData>({
    queryKey: ['engagement-trigger-timeline', triggerId],
    queryFn: async () => {
      const res = await fetch(`/api/engagement-triggers/${triggerId}/timeline`, authHeaders);
      if (!res.ok) throw new Error('Failed to load timeline');
      return res.json();
    },
    enabled: !!triggerId && open,
  });

  const statusColor = data?.trigger.status === 'completed' ? 'text-emerald-600'
    : data?.trigger.status === 'failed' ? 'text-red-600'
    : data?.trigger.status === 'scheduled' ? 'text-blue-600'
    : 'text-muted-foreground';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Engagement Timeline
          </SheetTitle>
          <SheetDescription>
            Full lifecycle of this cross-channel trigger
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          {isLoading ? (
            <div className="space-y-4 p-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="space-y-5 p-1">
              {/* Contact + Account header */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {[data.contact?.firstName, data.contact?.lastName].filter(Boolean).join(' ') || 'Unknown Contact'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {data.contact?.email && <span>{data.contact.email}</span>}
                    {data.account?.name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {data.account.name}
                      </span>
                    )}
                  </div>
                  {data.contact?.jobTitle && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{data.contact.jobTitle}</p>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', statusColor)}>
                  {data.trigger.status}
                </Badge>
              </div>

              {/* Flow summary bar */}
              <div className="flex items-center justify-center gap-3 py-2">
                <div className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5',
                  data.trigger.sourceChannel === 'call'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                )}>
                  {data.trigger.sourceChannel === 'call' ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  {data.trigger.sourceChannel === 'call' ? 'Voice Call' : 'Email'}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5',
                  data.trigger.targetChannel === 'call'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                )}>
                  {data.trigger.targetChannel === 'call' ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  {data.trigger.targetChannel === 'call' ? 'Call Follow-up' : 'Email Follow-up'}
                </div>
              </div>

              {/* Timeline events */}
              <div className="space-y-0">
                {data.timeline.map((event, idx) => (
                  <TimelineStep
                    key={event.id}
                    event={event}
                    isLast={idx === data.timeline.length - 1}
                  />
                ))}
              </div>

              {/* Payload details if present */}
              {data.trigger.triggerPayload && (
                <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">Trigger Context</p>
                  <div className="space-y-1.5 text-xs">
                    {(data.trigger.triggerPayload as any)?.callObjective && (
                      <div>
                        <span className="text-muted-foreground">Call Objective: </span>
                        <span className="text-foreground">{(data.trigger.triggerPayload as any).callObjective}</span>
                      </div>
                    )}
                    {(data.trigger.triggerPayload as any)?.callScript && (
                      <div>
                        <span className="text-muted-foreground">Script: </span>
                        <span className="text-foreground italic">{(data.trigger.triggerPayload as any).callScript}</span>
                      </div>
                    )}
                    {(data.trigger.triggerPayload as any)?.priority && (
                      <div>
                        <span className="text-muted-foreground">Priority: </span>
                        <Badge variant={(data.trigger.triggerPayload as any).priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] h-4">
                          {(data.trigger.triggerPayload as any).priority}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              <AlertCircle className="h-4 w-4 mr-2" />
              Could not load timeline
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
