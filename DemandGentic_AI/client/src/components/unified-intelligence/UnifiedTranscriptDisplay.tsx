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
      
        
        No transcript available
        Transcript may still be processing
      
    );
  }

  // Raw text fallback when no structured turns are available
  if (transcript.turns.length === 0 && transcript.rawText) {
    return (
      
        
          
            {transcript.rawText}
          
        
      
    );
  }

  return (
    
      {/* Transcript Status Indicators */}
      
        {!transcript.isFull && (
          
            
            Partial Transcript
          
        )}
        {!speakerAnalysis.hasProspect && speakerAnalysis.hasAgent && (
          
            
            Contact channel unavailable
          
        )}
        {!speakerAnalysis.hasAgent && speakerAnalysis.hasProspect && (
          
            
            Agent channel unavailable
          
        )}
      

      {/* Transcript Content */}
      
        
          {transcript.turns.map((turn, index) => (
            
          ))}
        
      

      {/* Raw Text Fallback */}
      {transcript.rawText && transcript.turns.length === 0 && (
        
          {transcript.rawText}
        
      )}
    
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
      
        
          {turn.text}
        
      
    );
  }

  return (
    
      {/* Agent icon on left */}
      {isAgent && (
        
          
        
      )}

      
        {/* Speaker badge and timestamp */}
        
          
            {isAgent ? 'AI Agent' : 'Contact'}
          
          {formattedTimestamp && (
             turn.startMs !== undefined && onTimestampClick?.(turn.startMs)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              disabled={turn.startMs === undefined}
            >
              
              {formattedTimestamp}
            
          )}
        

        {/* Message bubble */}
        
          {turn.text}
        
      

      {/* Prospect icon on right */}
      {!isAgent && (
        
          
        
      )}
    
  );
}