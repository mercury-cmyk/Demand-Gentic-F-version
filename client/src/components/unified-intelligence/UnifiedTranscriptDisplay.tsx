/**
 * Unified Transcript Display Component
 *
 * Two-sided conversation view with speaker identification for both
 * Agent and Prospect, with graceful handling of missing channels.
 *
 * Reuses the TranscriptDisplay component from call-intelligence
 * with enhanced speaker normalization for unified data.
 */

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bot, User, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedTranscript, TranscriptTurn } from './types';

interface UnifiedTranscriptDisplayProps {
  transcript: UnifiedTranscript;
  className?: string;
  maxHeight?: string;
  onTimestampClick?: (timeMs: number) => void;
}

export function UnifiedTranscriptDisplay({
  transcript,
  className,
  maxHeight = '400px',
  onTimestampClick,
}: UnifiedTranscriptDisplayProps) {
  // Check if we have both speakers
  const speakerAnalysis = useMemo(() => {
    const hasAgent = transcript.turns.some(t => t.speaker === 'agent');
    const hasProspect = transcript.turns.some(t => t.speaker === 'prospect');
    const hasSystem = transcript.turns.some(t => t.speaker === 'system');
    return { hasAgent, hasProspect, hasSystem };
  }, [transcript.turns]);

  // No transcript available — but fall back to rawText if present
  if (!transcript.available || (transcript.turns.length === 0 && !transcript.rawText)) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No transcript available</p>
        <p className="text-xs mt-1">Transcript may still be processing</p>
      </div>
    );
  }

  // Raw text fallback when no structured turns are available
  if (transcript.turns.length === 0 && transcript.rawText) {
    return (
      <div className={cn('space-y-2', className)}>
        <ScrollArea className="rounded-lg border" style={{ maxHeight }}>
          <div className="p-4">
            <pre className="whitespace-pre-wrap text-sm font-sans">{transcript.rawText}</pre>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Transcript Status Indicators */}
      <div className="flex items-center gap-2 flex-wrap">
        {!transcript.isFull && (
          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="h-3 w-3 mr-1" />
            Partial Transcript
          </Badge>
        )}
        {!speakerAnalysis.hasProspect && speakerAnalysis.hasAgent && (
          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Prospect channel unavailable
          </Badge>
        )}
        {!speakerAnalysis.hasAgent && speakerAnalysis.hasProspect && (
          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Agent channel unavailable
          </Badge>
        )}
      </div>

      {/* Transcript Content */}
      <ScrollArea className="rounded-lg border" style={{ maxHeight }}>
        <div className="space-y-3 p-4">
          {transcript.turns.map((turn, index) => (
            <TranscriptMessage
              key={index}
              turn={turn}
              onTimestampClick={onTimestampClick}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Raw Text Fallback */}
      {transcript.rawText && transcript.turns.length === 0 && (
        <div className="p-4 bg-muted/30 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm font-mono">{transcript.rawText}</pre>
        </div>
      )}
    </div>
  );
}

interface TranscriptMessageProps {
  turn: TranscriptTurn;
  onTimestampClick?: (timeMs: number) => void;
}

function TranscriptMessage({ turn, onTimestampClick }: TranscriptMessageProps) {
  const isAgent = turn.speaker === 'agent';
  const isSystem = turn.speaker === 'system';

  // Format timestamp for display
  const formattedTimestamp = useMemo(() => {
    if (turn.timestamp) return turn.timestamp;
    if (turn.startMs !== undefined) {
      const totalSeconds = Math.floor(turn.startMs / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return null;
  }, [turn.timestamp, turn.startMs]);

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted/50 px-3 py-1 rounded-full text-xs text-muted-foreground italic">
          {turn.text}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2',
        isAgent ? 'justify-start' : 'justify-end'
      )}
    >
      {/* Agent icon on left */}
      {isAgent && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[75%] space-y-1',
          isAgent ? 'items-start' : 'items-end'
        )}
      >
        {/* Speaker badge and timestamp */}
        <div
          className={cn(
            'flex items-center gap-2 text-xs text-muted-foreground',
            isAgent ? 'justify-start' : 'justify-end'
          )}
        >
          <Badge
            variant={isAgent ? 'default' : 'secondary'}
            className="text-xs px-1.5 py-0"
          >
            {isAgent ? 'AI Agent' : 'Prospect'}
          </Badge>
          {formattedTimestamp && (
            <button
              onClick={() => turn.startMs !== undefined && onTimestampClick?.(turn.startMs)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              disabled={turn.startMs === undefined}
            >
              <Clock className="h-3 w-3" />
              <span>{formattedTimestamp}</span>
            </button>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm',
            isAgent
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          )}
        >
          {turn.text}
        </div>
      </div>

      {/* Prospect icon on right */}
      {!isAgent && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
