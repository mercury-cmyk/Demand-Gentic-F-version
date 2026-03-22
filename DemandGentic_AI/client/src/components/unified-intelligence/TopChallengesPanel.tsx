/**
 * Top Challenges Panel Component
 *
 * Displays aggregated top-priority challenges across all conversations.
 * Sorted by severity (high → medium → low) then by frequency.
 * Shows actionable improvement suggestions.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, Lightbulb, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TopChallenge } from './types';
import { getSeverityColor } from './types';

interface TopChallengesPanelProps {
  challenges: TopChallenge[];
  totalIssues: number;
  className?: string;
}

export function TopChallengesPanel({
  challenges,
  totalIssues,
  className,
}: TopChallengesPanelProps) {
  if (!challenges || challenges.length === 0) {
    return null;
  }

  return (
    
      
        
          
          Top Challenges ({totalIssues} total issues across all calls)
        
      
      
        {challenges.map((challenge, idx) => (
          
        ))}
      
    
  );
}

function ChallengeItem({ challenge, rank }: { challenge: TopChallenge; rank: number }) {
  const uniqueSuggestions = [...new Set(challenge.suggestions)].slice(0, 2);

  return (
    
      
        #{rank}
        
          
            
              {challenge.severity}
            
            
              {formatChallengeType(challenge.type)}
            
            
              
              {challenge.count}x
            
          
          {challenge.description}
        
      

      {uniqueSuggestions.length > 0 && (
        
          {uniqueSuggestions.map((suggestion, i) => (
            
              
              {suggestion}
            
          ))}
        
      )}
    
  );
}

function formatChallengeType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}