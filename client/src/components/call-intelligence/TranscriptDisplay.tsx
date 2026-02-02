/**
 * Transcript Display Component
 *
 * Two-sided conversation view with speaker identification,
 * role-based coloring, and timestamp display.
 */

import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Bot, User, MessageSquare, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TranscriptTurn } from './types';

interface TranscriptDisplayProps {
  transcript?: string | null;
  turns?: TranscriptTurn[];
  className?: string;
  maxHeight?: string;
  onTimestampClick?: (timestamp: string) => void;
}

// Parse plain text transcript into turns
function parseTranscript(text: string): TranscriptTurn[] {
  const lines = text.split('\n').filter((line) => line.trim());
  const turns: TranscriptTurn[] = [];

  for (const line of lines) {
    // Try to detect speaker from line prefix
    const agentMatch = line.match(/^(Agent|AI|Assistant|Bot):\s*/i);
    const contactMatch = line.match(/^(Contact|Customer|Prospect|User|Caller):\s*/i);
    const systemMatch = line.match(/^(System|Note):\s*/i);
    const timestampMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/);

    let role: TranscriptTurn['role'] = 'agent';
    let text = line;
    let timestamp: string | undefined;

    // Extract timestamp if present
    if (timestampMatch) {
      timestamp = timestampMatch[1];
      text = text.replace(timestampMatch[0], '');
    }

    // Detect role from prefix
    if (agentMatch) {
      role = 'agent';
      text = text.replace(agentMatch[0], '');
    } else if (contactMatch) {
      role = 'contact';
      text = text.replace(contactMatch[0], '');
    } else if (systemMatch) {
      role = 'system';
      text = text.replace(systemMatch[0], '');
    } else {
      // Alternate between agent and contact if no explicit marker
      role = turns.length % 2 === 0 ? 'agent' : 'contact';
    }

    if (text.trim()) {
      turns.push({ role, text: text.trim(), timestamp });
    }
  }

  return turns;
}

// Normalize role to standard format
function normalizeRole(role: string): TranscriptTurn['role'] {
  const roleLower = role.toLowerCase();
  if (['agent', 'assistant', 'ai', 'bot'].includes(roleLower)) {
    return 'agent';
  }
  if (['contact', 'user', 'customer', 'prospect', 'caller'].includes(roleLower)) {
    return 'contact';
  }
  if (['system', 'note'].includes(roleLower)) {
    return 'system';
  }
  return 'agent';
}

export function TranscriptDisplay({
  transcript,
  turns: providedTurns,
  className,
  maxHeight = '400px',
  onTimestampClick,
}: TranscriptDisplayProps) {
  // Parse transcript into turns if not provided
  const turns = useMemo(() => {
    if (providedTurns && providedTurns.length > 0) {
      return providedTurns.map((turn) => ({
        ...turn,
        role: normalizeRole(turn.role),
      }));
    }
    if (transcript) {
      return parseTranscript(transcript);
    }
    return [];
  }, [providedTurns, transcript]);

  if (turns.length === 0 && !transcript) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 text-muted-foreground', className)}>
        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm">No transcript available</p>
        <p className="text-xs mt-1">Transcribe this call to view the conversation</p>
      </div>
    );
  }

  // If we have plain text but couldn't parse turns, show as plain text
  if (turns.length === 0 && transcript) {
    return (
      <ScrollArea className={cn('rounded-lg', className)} style={{ maxHeight }}>
        <div className="p-4 bg-muted/30 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm font-mono">{transcript}</pre>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className={cn('rounded-lg', className)} style={{ maxHeight }}>
      <div className="space-y-3 p-4">
        {turns.map((turn, index) => (
          <TranscriptMessage
            key={index}
            turn={turn}
            onTimestampClick={onTimestampClick}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface TranscriptMessageProps {
  turn: TranscriptTurn;
  onTimestampClick?: (timestamp: string) => void;
}

function TranscriptMessage({ turn, onTimestampClick }: TranscriptMessageProps) {
  const isAgent = turn.role === 'agent' || turn.role === 'assistant';
  const isSystem = turn.role === 'system';

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
          <Badge variant={isAgent ? 'default' : 'secondary'} className="text-xs px-1.5 py-0">
            {isAgent ? 'AI Agent' : 'Prospect'}
          </Badge>
          {turn.timestamp && (
            <button
              onClick={() => onTimestampClick?.(turn.timestamp!)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Clock className="h-3 w-3" />
              <span>{turn.timestamp}</span>
            </button>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            'px-3 py-2 rounded-lg text-sm',
            isAgent
              ? 'bg-primary/10 text-foreground rounded-tl-none'
              : 'bg-muted text-foreground rounded-tr-none'
          )}
        >
          {turn.text}
        </div>
      </div>

      {/* Contact icon on right */}
      {!isAgent && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export default TranscriptDisplay;
