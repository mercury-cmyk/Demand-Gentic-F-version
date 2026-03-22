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
      
        {Array.from({ length: 8 }).map((_, i) => (
          
        ))}
      
    );
  }

  if (calls.length === 0) {
    return (
      
        
        No calls found
        Try adjusting your filters
      
    );
  }

  return (
    
      
        {calls.map((call) => (
           onSelectCall(call.id)}
          />
        ))}
      
    
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
    
      
        {/* Header Row */}
        
          
            {/* Agent Type Badge */}
            
              {call.agentType === 'ai' ? (
                
              ) : (
                
              )}
              {call.agentType === 'ai' ? 'AI' : 'Human'}
            

            {/* Contact Name */}
            {call.contact.name}
          

          {/* Quality Score */}
          {hasAnalysis && call.quality.overallScore !== undefined && (
            
              {call.quality.overallScore}
            
          )}
        

        {/* Company Row */}
        
          
          {call.contact.company}
        

        {/* Campaign & Disposition Row */}
        
          
            {call.campaign.name}
          
          {call.disposition && (
            
              {call.disposition.replace(/_/g, ' ')}
            
          )}
          {call.quality.sentiment && (
            
              {call.quality.sentiment}
            
          )}
        

        {/* Footer Row */}
        
          
            {/* Duration */}
            
              
              {formatDuration(call.durationSec)}
            

            {/* Date */}
            {call.startedAt && !isNaN(new Date(call.startedAt).getTime()) ? (
              
                {formatDistanceToNow(new Date(call.startedAt), { addSuffix: true })}
              
            ) : (
              --
            )}
          

          {/* Content Indicators */}
          
            {hasRecording && (
              
                
              
            )}
            {hasTranscript && (
              
                
              
            )}
            {hasAnalysis && (
              
                
              
            )}
            {call.lead && (
              
                
              
            )}
          
        
      
    
  );
}

function CallListItemSkeleton() {
  return (
    
      
        
          
          
        
        
      
      
        
        
      
      
        
        
      
      
        
          
          
        
        
          
          
        
      
    
  );
}

export default CallList;