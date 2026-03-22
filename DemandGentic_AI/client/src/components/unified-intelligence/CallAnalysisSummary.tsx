/**
 * Call Analysis Summary Component
 *
 * Displays call analysis data in the same format as the Test AI Agent
 * call analysis from Campaigns → Test AI Agent → Call Analysis.
 *
 * This component is designed to be reused across:
 * - Unified Intelligence page (new)
 * - Campaign Test Panel (existing - no changes needed, uses its own inline view)
 * - Any future pages that need call analysis display
 *
 * The data structure matches what the campaign test calls endpoint returns.
 */

import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Lightbulb,
  Target,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  UnifiedCallAnalysis,
  PerformanceMetrics,
  DetectedIssue,
} from './types';
import { getSeverityColor } from './types';

interface CallAnalysisSummaryProps {
  analysis: UnifiedCallAnalysis;
  duration?: number;
  disposition?: string;
  status?: string;
  className?: string;
}

export function CallAnalysisSummary({
  analysis,
  duration,
  disposition,
  status,
  className,
}: CallAnalysisSummaryProps) {
  const hasMetrics = Object.keys(analysis.metrics).length > 0;
  const hasIssues = analysis.detectedIssues.length > 0;
  const hasStates = analysis.conversationStates.length > 0;

  return (
    
      {/* Header: Status / Result / Duration / Disposition */}
      
        {status && (
          
            Status
            
          
        )}
        {analysis.testResult && (
          
            Result
            
          
        )}
        {duration !== undefined && (
          
            Duration
            
              
              {formatSeconds(duration)}
            
          
        )}
        {disposition && (
          
            Disposition
            
              {disposition.replace(/_/g, ' ')}
            
          
        )}
      

      {/* Call Summary */}
      {analysis.summaryText && (
        
          
            
            Call Summary
          
          {analysis.summaryText}
        
      )}

      {/* Performance Metrics */}
      {hasMetrics && (
        
          
            
              
                
                Performance Metrics
              
            
            
              
                {Object.entries(analysis.metrics).map(([key, value]) => (
                  
                ))}
              
            
          
        
      )}

      {/* Conversation States Reached */}
      {hasStates && (
        
          
            
              
                
                Conversation States Reached ({analysis.conversationStates.length})
              
            
            
              
                {analysis.conversationStates.map((state, idx) => (
                  
                    {formatStateName(state)}
                  
                ))}
              
            
          
        
      )}

      {/* Detected Issues */}
      {hasIssues && (
        
          
            
              
                
                Detected Issues ({analysis.detectedIssues.length})
              
            
            
              
                {analysis.detectedIssues.map((issue, idx) => (
                  
                ))}
              
            
          
        
      )}
    
  );
}

// ============================================
// Sub-components
// ============================================

function StatusBadge({ status }: { status: string }) {
  const config: Record = {
    completed: { className: 'bg-green-600', icon:  },
    in_progress: { className: 'border-blue-500 text-blue-600', icon:  },
    pending: { className: '', icon:  },
    failed: { className: 'bg-red-600', icon:  },
  };

  const { className, icon } = config[status] || { className: '', icon: null };
  const variant = status === 'completed' || status === 'failed' ? 'default' : 'outline';

  return (
    
      {icon}
      {status.replace(/_/g, ' ')}
    
  );
}

function ResultBadge({ result }: { result: string }) {
  const config: Record = {
    success: { className: 'bg-green-600', icon:  },
    needs_improvement: { className: 'border-yellow-500 text-yellow-600', icon:  },
    failed: { className: 'bg-red-600', icon:  },
  };

  const { className, icon } = config[result] || { className: '', icon: null };
  const variant = result === 'success' || result === 'failed' ? 'default' : 'outline';

  return (
    
      {icon}
      {result.replace(/_/g, ' ')}
    
  );
}

function MetricItem({ name, value }: { name: string; value: boolean | number | string | undefined }) {
  const formattedName = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();

  const displayValue = typeof value === 'boolean'
    ? (value ? '✓' : '✗')
    : String(value);

  const bgClass = typeof value === 'boolean'
    ? (value ? 'bg-green-50 border-green-200' : 'bg-muted/30')
    : 'bg-muted/30';

  return (
    
      {formattedName}
      {displayValue}
    
  );
}

function IssueItem({ issue }: { issue: DetectedIssue }) {
  return (
    
      
        
          {issue.severity}
        
        
          
            {issue.type || formatStateName(issue.code)}
          
          {issue.description}
          {issue.recommendation && (
            
              
              {issue.recommendation}
            
          )}
          {issue.evidence && (
            
              "{issue.evidence}"
            
          )}
        
      
    
  );
}

// ============================================
// Utility functions
// ============================================

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatStateName(state: string): string {
  return state
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}