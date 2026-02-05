/**
 * Unified Detail Panel Component
 *
 * Complete detail view for a selected conversation including:
 * - Header / Metadata
 * - Recording Playback
 * - Two-Sided Transcript
 * - Call Analysis Summary (matching Test AI Agent workflow)
 * - Quality Analysis Panel
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Building,
  Clock,
  Calendar,
  Phone,
  FileText,
  BarChart3,
  Sparkles,
  MessageSquare,
  Mic,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { UnifiedConversationDetail } from './types';
import { UnifiedRecordingPlayer } from './UnifiedRecordingPlayer';
import { UnifiedTranscriptDisplay } from './UnifiedTranscriptDisplay';
import { CallAnalysisSummary } from './CallAnalysisSummary';
import { QualityAnalysisPanel } from './QualityAnalysisPanel';

interface UnifiedDetailPanelProps {
  conversation: UnifiedConversationDetail | null;
  isLoading: boolean;
  className?: string;
}

export function UnifiedDetailPanel({
  conversation,
  isLoading,
  className,
}: UnifiedDetailPanelProps) {
  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('h-full', className)}>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!conversation) {
    return (
      <Card className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center text-muted-foreground p-8">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm mt-1">Choose a conversation from the list to view details</p>
        </div>
      </Card>
    );
  }

  const isTest = conversation.type === 'test';
  const hasCallAnalysis = conversation.callAnalysis.summaryText ||
    Object.keys(conversation.callAnalysis.metrics).length > 0 ||
    conversation.callAnalysis.detectedIssues.length > 0;
  const hasQualityAnalysis = conversation.qualityAnalysis.score !== undefined ||
    Object.keys(conversation.qualityAnalysis.subscores).length > 0;

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header Section */}
          <HeaderSection conversation={conversation} isTest={isTest} />

          <Separator />

          {/* Tabbed Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="transcript" className="text-xs">
                <MessageSquare className="h-3 w-3 mr-1" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="analysis" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="quality" className="text-xs">
                <Mic className="h-3 w-3 mr-1" />
                Quality
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Recording Player */}
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Recording
                </h3>
                <UnifiedRecordingPlayer
                  recordingId={conversation.id}
                  recording={conversation.recording}
                />
              </div>

              {/* Quick Summary */}
              {conversation.callAnalysis.summaryText && (
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Call Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    {conversation.callAnalysis.summaryText}
                  </p>
                </div>
              )}

              {/* Transcript Preview */}
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transcript Preview
                </h3>
                <UnifiedTranscriptDisplay
                  transcript={conversation.transcript}
                  maxHeight="250px"
                />
              </div>
            </TabsContent>

            {/* Full Transcript Tab */}
            <TabsContent value="transcript" className="mt-4">
              <UnifiedTranscriptDisplay
                transcript={conversation.transcript}
                maxHeight="600px"
              />
            </TabsContent>

            {/* Call Analysis Tab */}
            <TabsContent value="analysis" className="mt-4">
              {hasCallAnalysis ? (
                <CallAnalysisSummary
                  analysis={conversation.callAnalysis}
                  duration={conversation.durationSec}
                  disposition={conversation.disposition}
                  status={conversation.status}
                />
              ) : (
                <EmptyAnalysisState type="call" />
              )}
            </TabsContent>

            {/* Quality Analysis Tab */}
            <TabsContent value="quality" className="mt-4">
              {hasQualityAnalysis ? (
                <QualityAnalysisPanel analysis={conversation.qualityAnalysis} />
              ) : (
                <EmptyAnalysisState type="quality" />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </Card>
  );
}

// ============================================
// Sub-components
// ============================================

function HeaderSection({
  conversation,
  isTest,
}: {
  conversation: UnifiedConversationDetail;
  isTest: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Contact & Company */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{conversation.contact.name}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <Building className="h-3.5 w-3.5" />
            <span>{conversation.contact.company}</span>
            {conversation.contact.jobTitle && (
              <>
                <span>•</span>
                <span>{conversation.contact.jobTitle}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isTest ? 'outline' : 'default'} className={isTest ? 'bg-yellow-50 text-yellow-700 border-yellow-300' : ''}>
            {isTest ? 'Test' : 'Production'}
          </Badge>
          {conversation.agentType === 'ai' && (
            <Badge variant="secondary">AI Agent</Badge>
          )}
        </div>
      </div>

      {/* Metadata Row */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Building className="h-3.5 w-3.5" />
          <span>{conversation.campaign.name}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{format(new Date(conversation.createdAt), 'MMM d, yyyy HH:mm')}</span>
        </div>
        {conversation.durationSec !== undefined && conversation.durationSec > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {Math.floor(conversation.durationSec / 60)}:{String(conversation.durationSec % 60).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{conversation.status}</Badge>
        {conversation.result && (
          <Badge variant="outline">{conversation.result}</Badge>
        )}
        {conversation.disposition && (
          <DispositionBadge disposition={conversation.disposition} />
        )}
      </div>
    </div>
  );
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record<string, { variant: 'default' | 'outline' | 'destructive'; className?: string }> = {
    qualified: { variant: 'default', className: 'bg-green-600' },
    not_interested: { variant: 'outline' },
    voicemail: { variant: 'outline' },
    no_answer: { variant: 'outline' },
    callback_requested: { variant: 'default', className: 'bg-blue-600' },
    callback: { variant: 'default', className: 'bg-blue-600' },
    dnc_request: { variant: 'destructive' },
  };

  const { variant, className } = config[disposition] || { variant: 'outline' };

  return (
    <Badge variant={variant} className={className}>
      {disposition.replace(/_/g, ' ')}
    </Badge>
  );
}

function EmptyAnalysisState({ type }: { type: 'call' | 'quality' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-sm">
        No {type === 'call' ? 'call analysis' : 'quality analysis'} available
      </p>
      <p className="text-xs mt-1">
        Analysis may still be processing or unavailable for this conversation
      </p>
    </div>
  );
}
