/**
 * Call List Component
 *
 * Displays a list of calls with contact info, badges for status,
 * quality scores, and visual indicators for recordings/transcripts.
 */

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bot,
  User,
  Phone,
  Clock,
  Building2,
  Mic,
  FileText,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  type UnifiedCallRecord,
  getQualityScoreColor,
  formatDuration,
  AGENT_TYPE_COLORS,
  SENTIMENT_COLORS,
} from './types';

interface CallListProps {
  calls: UnifiedCallRecord[];
  selectedCallId: string | null;
  onSelectCall: (callId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function CallList({
  calls,
  selectedCallId,
  onSelectCall,
  isLoading,
  className,
}: CallListProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-2 p-2', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <CallListItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
        <Phone className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No calls found</p>
        <p className="text-xs mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <div className="space-y-1 p-2">
        {calls.map((call) => (
          <CallListItem
            key={call.id}
            call={call}
            isSelected={call.id === selectedCallId}
            onSelect={() => onSelectCall(call.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface CallListItemProps {
  call: UnifiedCallRecord;
  isSelected: boolean;
  onSelect: () => void;
}

function CallListItem({ call, isSelected, onSelect }: CallListItemProps) {
  const hasRecording = call.recording.available;
  const hasTranscript = call.transcript.available;
  const hasAnalysis = call.quality.analyzed;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        'hover:bg-accent/50 hover:border-accent',
        isSelected
          ? 'bg-accent border-primary ring-2 ring-primary/20'
          : 'bg-card border-border'
      )}
    >
      <div className="space-y-2">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Agent Type Badge */}
            <Badge
              variant="outline"
              className={cn(
                'text-xs flex-shrink-0',
                call.agentType === 'ai' ? 'border-purple-500 text-purple-600' : 'border-blue-500 text-blue-600'
              )}
            >
              {call.agentType === 'ai' ? (
                <Bot className="h-3 w-3 mr-1" />
              ) : (
                <User className="h-3 w-3 mr-1" />
              )}
              {call.agentType === 'ai' ? 'AI' : 'Human'}
            </Badge>

            {/* Contact Name */}
            <span className="font-medium text-sm truncate">{call.contact.name}</span>
          </div>

          {/* Quality Score */}
          {hasAnalysis && call.quality.overallScore !== undefined && (
            <Badge className={cn('text-xs flex-shrink-0', getQualityScoreColor(call.quality.overallScore))}>
              {call.quality.overallScore}
            </Badge>
          )}
        </div>

        {/* Company Row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{call.contact.company}</span>
        </div>

        {/* Campaign & Disposition Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {call.campaign.name}
          </Badge>
          {call.disposition && (
            <Badge variant="secondary" className="text-xs capitalize">
              {call.disposition.replace(/_/g, ' ')}
            </Badge>
          )}
          {call.quality.sentiment && (
            <Badge className={cn('text-xs capitalize', SENTIMENT_COLORS[call.quality.sentiment] || 'bg-gray-500')}>
              {call.quality.sentiment}
            </Badge>
          )}
        </div>

        {/* Footer Row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            {/* Duration */}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(call.durationSec)}
            </span>

            {/* Date */}
            {call.startedAt && !isNaN(new Date(call.startedAt).getTime()) ? (
              <span title={format(new Date(call.startedAt), 'PPpp')}>
                {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
              </span>
            ) : (
              <span>--</span>
            )}
          </div>

          {/* Content Indicators */}
          <div className="flex items-center gap-1">
            {hasRecording && (
              <span className="text-green-500" title="Recording available">
                <Mic className="h-3.5 w-3.5" />
              </span>
            )}
            {hasTranscript && (
              <span className="text-blue-500" title="Transcript available">
                <FileText className="h-3.5 w-3.5" />
              </span>
            )}
            {hasAnalysis && (
              <span className="text-purple-500" title="Quality analysis available">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            )}
            {call.lead && (
              <span className="text-green-600" title={`Lead: ${call.lead.qaStatus}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function CallListItemSkeleton() {
  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-5 w-10" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-3.5 w-3.5" />
          <Skeleton className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

export default CallList;
