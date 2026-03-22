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
      
        
        No transcript available
        Transcribe this call to view the conversation
      
    );
  }

  // If we have plain text but couldn't parse turns, show as plain text
  if (turns.length === 0 && transcript) {
    return (
      
        
          {transcript}
        
      
    );
  }

  return (
    
      
        {turns.map((turn, index) => (
          
        ))}
      
    
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
      
        
          {turn.text}
        
      
    );
  }

  return (
    
      {/* Agent icon on left */}
      {isAgent && (
        
          
        
      )}

      
        {/* Speaker badge and timestamp */}
        
          
            {isAgent ? 'Agent' : 'Contact'}
          
          {turn.timestamp && (
             onTimestampClick?.(turn.timestamp!)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              
              {turn.timestamp}
            
          )}
        

        {/* Message bubble */}
        
          {turn.text}
        
      

      {/* Contact icon on right */}
      {!isAgent && (
        
          
        
      )}
    
  );
}

export default TranscriptDisplay;