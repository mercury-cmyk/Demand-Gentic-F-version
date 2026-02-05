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
    <div className={cn('space-y-4', className)}>
      {/* Header: Status / Result / Duration / Disposition */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {status && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <StatusBadge status={status} />
          </div>
        )}
        {analysis.testResult && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Result</div>
            <ResultBadge result={analysis.testResult} />
          </div>
        )}
        {duration !== undefined && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Duration</div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{formatSeconds(duration)}</span>
            </div>
          </div>
        )}
        {disposition && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Disposition</div>
            <Badge variant="outline" className="capitalize">
              {disposition.replace(/_/g, ' ')}
            </Badge>
          </div>
        )}
      </div>

      {/* Call Summary */}
      {analysis.summaryText && (
        <div className="bg-muted/30 p-4 rounded-lg">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Target className="h-4 w-4" />
            Call Summary
          </h4>
          <p className="text-sm text-muted-foreground">{analysis.summaryText}</p>
        </div>
      )}

      {/* Performance Metrics */}
      {hasMetrics && (
        <Accordion type="single" collapsible defaultValue="metrics">
          <AccordionItem value="metrics" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4" />
                Performance Metrics
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(analysis.metrics).map(([key, value]) => (
                  <MetricItem key={key} name={key} value={value} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Conversation States Reached */}
      {hasStates && (
        <Accordion type="single" collapsible>
          <AccordionItem value="states" className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Conversation States Reached ({analysis.conversationStates.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {analysis.conversationStates.map((state, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="bg-green-50 text-green-700 border-green-300"
                  >
                    {formatStateName(state)}
                  </Badge>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Detected Issues */}
      {hasIssues && (
        <Accordion type="single" collapsible defaultValue="issues">
          <AccordionItem value="issues" className="border border-yellow-200 rounded-lg bg-yellow-50/50">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Detected Issues ({analysis.detectedIssues.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-3">
                {analysis.detectedIssues.map((issue, idx) => (
                  <IssueItem key={idx} issue={issue} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    completed: { className: 'bg-green-600', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
    in_progress: { className: 'border-blue-500 text-blue-600', icon: <Clock className="w-3 h-3 mr-1 animate-pulse" /> },
    pending: { className: '', icon: <Clock className="w-3 h-3 mr-1" /> },
    failed: { className: 'bg-red-600', icon: <XCircle className="w-3 h-3 mr-1" /> },
  };

  const { className, icon } = config[status] || { className: '', icon: null };
  const variant = status === 'completed' || status === 'failed' ? 'default' : 'outline';

  return (
    <Badge variant={variant} className={className}>
      {icon}
      <span className="capitalize">{status.replace(/_/g, ' ')}</span>
    </Badge>
  );
}

function ResultBadge({ result }: { result: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    success: { className: 'bg-green-600', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> },
    needs_improvement: { className: 'border-yellow-500 text-yellow-600', icon: <AlertTriangle className="w-3 h-3 mr-1" /> },
    failed: { className: 'bg-red-600', icon: <XCircle className="w-3 h-3 mr-1" /> },
  };

  const { className, icon } = config[result] || { className: '', icon: null };
  const variant = result === 'success' || result === 'failed' ? 'default' : 'outline';

  return (
    <Badge variant={variant} className={className}>
      {icon}
      <span className="capitalize">{result.replace(/_/g, ' ')}</span>
    </Badge>
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
    <div className={cn('flex justify-between items-center p-2 rounded border', bgClass)}>
      <span className="text-sm capitalize">{formattedName}</span>
      <span className="font-medium">{displayValue}</span>
    </div>
  );
}

function IssueItem({ issue }: { issue: DetectedIssue }) {
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-start gap-2">
        <Badge
          variant="outline"
          className={cn('text-xs shrink-0', getSeverityColor(issue.severity))}
        >
          {issue.severity}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">
            {issue.type || formatStateName(issue.code)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
          {issue.recommendation && (
            <div className="text-sm text-green-600 mt-2 flex items-start gap-1">
              <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{issue.recommendation}</span>
            </div>
          )}
          {issue.evidence && (
            <div className="text-xs text-muted-foreground mt-2 italic bg-muted/50 p-2 rounded">
              "{issue.evidence}"
            </div>
          )}
        </div>
      </div>
    </div>
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
