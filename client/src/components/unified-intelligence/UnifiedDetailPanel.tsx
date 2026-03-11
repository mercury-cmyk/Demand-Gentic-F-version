/**
 * Unified Detail Panel Component
 *
 * Complete detail view for a selected conversation including:
 * - Header / Metadata
 * - Recording status (playback deactivated)
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
import { Button } from '@/components/ui/button';
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
  Brain,
  Loader2,
  History,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { UnifiedConversationDetail, CallHistoryEntry } from './types';
import { UnifiedTranscriptDisplay } from './UnifiedTranscriptDisplay';
import { CallAnalysisSummary } from './CallAnalysisSummary';
import { QualityAnalysisPanel } from './QualityAnalysisPanel';
import { AgentLearningPipeline } from '../call-intelligence/AgentLearningPipeline';
import { QualityIssue, QualityRecommendation } from '../call-intelligence/types';
import { PushToShowcaseButton } from '../showcase-calls/push-to-showcase-button';

interface UnifiedDetailPanelProps {
  conversation: UnifiedConversationDetail | null;
  isLoading: boolean;
  className?: string;
  onAnalyze?: (sessionId: string) => void;
  onTranscribe?: (sessionId: string) => void;
  onSelectHistoryCall?: (sessionId: string) => void;
  isAnalyzing?: boolean;
  isTranscribing?: boolean;
}

export function UnifiedDetailPanel({
  conversation,
  isLoading,
  className,
  onAnalyze,
  onTranscribe,
  onSelectHistoryCall,
  isAnalyzing,
  isTranscribing,
}: UnifiedDetailPanelProps) {
  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('h-full bg-background/80', className)}>
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
      <Card className={cn('h-full flex items-center justify-center bg-background/80', className)}>
        <div className="text-center text-muted-foreground p-8 border border-dashed rounded-lg bg-muted/20">
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
  const hasTranscriptContent = conversation.transcript.available;
  const hasRecordingAvailable = conversation.recording.available;
  const canAnalyze = hasTranscriptContent && !hasCallAnalysis && conversation.source === 'call_session';
  const canTranscribe = Boolean(onTranscribe) && hasRecordingAvailable && !hasTranscriptContent && conversation.source === 'call_session';
  const canPushToShowcase = conversation.source === 'call_session';
  const hasCallHistory = (conversation.callCount || 1) > 1 && conversation.callHistory;

  // Map issues and recommendations for the Learning Pipeline
  const learningIssues: QualityIssue[] = conversation.callAnalysis.detectedIssues.map(issue => ({
    type: issue.type || issue.code,
    severity: issue.severity as 'high' | 'medium' | 'low',
    description: issue.description,
    recommendation: issue.recommendation
  }));

  const learningRecommendations: QualityRecommendation[] = conversation.qualityAnalysis.recommendations.map(rec => ({
    category: rec.category || rec.area,
    suggestedChange: rec.suggestedChange || rec.text,
    expectedImpact: rec.impact || 'medium',
    priority: (rec.priority as 'high' | 'medium' | 'low') || 'medium'
  }));

  return (
    <Card className={cn('h-full flex flex-col bg-background/80', className)}>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header Section */}
          <HeaderSection conversation={conversation} isTest={isTest} />

          <Separator />

          {/* Tabbed Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-muted/40 p-1 rounded-lg">
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
              {/* Action Buttons: Analyze / Transcribe */}
              {(canAnalyze || canTranscribe || canPushToShowcase) && (
                <div className="flex gap-2 flex-wrap">
                  {canAnalyze && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onAnalyze?.(conversation.id)}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Brain className="h-4 w-4 mr-2" />
                      )}
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Call'}
                    </Button>
                  )}
                  {canTranscribe && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onTranscribe?.(conversation.id)}
                      disabled={isTranscribing}
                    >
                      {isTranscribing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
                    </Button>
                  )}
                  {canPushToShowcase && (
                    <PushToShowcaseButton
                      callSessionId={conversation.id}
                      contactName={conversation.contact.name}
                      sourceLabel="Unified Intelligence"
                      buttonProps={{ size: "sm", variant: "outline" }}
                    />
                  )}
                </div>
              )}

              {/* Call History (when contact has multiple calls) */}
              {hasCallHistory && (
                <div className="rounded-lg border bg-background/70 p-3">
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Call History ({conversation.callCount} calls to this contact)
                  </h3>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                    {conversation.callHistory!.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center justify-between text-xs p-2 rounded border cursor-pointer hover:bg-muted/50 transition-colors bg-background/70',
                          entry.id === conversation.id && 'ring-1 ring-primary bg-primary/5'
                        )}
                        onClick={() => onSelectHistoryCall?.(entry.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">#{idx + 1}</span>
                          <Badge variant="outline" className="text-[10px]">{entry.status}</Badge>
                          {entry.disposition && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {entry.disposition.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {entry.hasTranscript && <FileText className="h-3 w-3 text-green-500" />}
                          {entry.hasRecording && <Mic className="h-3 w-3 text-blue-500" />}
                          {entry.hasAnalysis && <BarChart3 className="h-3 w-3 text-purple-500" />}
                          {entry.duration && (
                            <span>{Math.floor(entry.duration / 60)}:{String(entry.duration % 60).padStart(2, '0')}</span>
                          )}
                          <span>{format(new Date(entry.createdAt), 'MMM d, HH:mm')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent Learning Pipeline - Prominently mapped here */}
              {(learningIssues.length > 0 || learningRecommendations.length > 0) && (
                <div className="rounded-lg border bg-background/70 p-3">
                   <AgentLearningPipeline
                      issues={learningIssues}
                      recommendations={learningRecommendations}
                   />
                </div>
              )}

              {/* Recording */}
              <div className="rounded-lg border bg-background/70 p-3">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Recording
                </h3>
                {conversation.recording.url ? (
                  <div className="space-y-2">
                    <audio controls className="w-full h-8" preload="metadata">
                      <source src={conversation.recording.url} />
                      Your browser does not support audio playback.
                    </audio>
                    <a
                      href={conversation.recording.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Recording URL
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {conversation.recording.available ? 'Recording stored but URL not available' : 'No recording available for this call'}
                  </p>
                )}
              </div>

              {/* Quick Summary */}
              {conversation.callAnalysis.summaryText && (
                <div className="bg-muted/40 p-4 rounded-lg border">
                  <h3 className="text-sm font-medium mb-2">Call Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    {conversation.callAnalysis.summaryText}
                  </p>
                </div>
              )}

              {/* Transcript Preview */}
              <div className="rounded-lg border bg-background/70 p-3">
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
              {hasTranscriptContent ? (
                <UnifiedTranscriptDisplay
                  transcript={conversation.transcript}
                  maxHeight="600px"
                />
              ) : canTranscribe ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm mb-1">No transcript available</p>
                  <p className="text-xs mb-3">A recording exists — transcription can be generated</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onTranscribe?.(conversation.id)}
                    disabled={isTranscribing}
                  >
                    {isTranscribing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm">No transcript available</p>
                  <p className="text-xs mt-1">No recording available to generate transcript from</p>
                </div>
              )}
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
              ) : canAnalyze ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                  <Brain className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm mb-3">No analysis yet — transcript is available</p>
                  <Button
                    size="sm"
                    onClick={() => onAnalyze?.(conversation.id)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze This Call'}
                  </Button>
                </div>
              ) : (
                <EmptyAnalysisState type="call" canTranscribe={canTranscribe} onTranscribe={() => onTranscribe?.(conversation.id)} isTranscribing={isTranscribing} />
              )}
            </TabsContent>

            {/* Quality Analysis Tab */}
            <TabsContent value="quality" className="mt-4">
              {hasQualityAnalysis ? (
                <QualityAnalysisPanel analysis={conversation.qualityAnalysis} />
              ) : (
                <EmptyAnalysisState type="quality" canTranscribe={canTranscribe} onTranscribe={() => onTranscribe?.(conversation.id)} isTranscribing={isTranscribing} />
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
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
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
          {conversation.contact.phone && (
            <div className="flex items-center gap-1.5 mt-1.5 bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-md text-sm w-fit">
              <Phone className="h-3.5 w-3.5" />
              {conversation.contact.phone}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={isTest ? 'outline' : 'default'} className={isTest ? 'bg-yellow-50 text-yellow-700 border-yellow-300' : ''}>
            {isTest ? 'Test' : 'Production'}
          </Badge>
          {conversation.agentType === 'ai' && (
            <Badge variant="secondary">{conversation.agentName || 'AI Agent'}</Badge>
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

function EmptyAnalysisState({ type, canTranscribe, onTranscribe, isTranscribing }: { type: 'call' | 'quality'; canTranscribe?: boolean; onTranscribe?: () => void; isTranscribing?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
      <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-sm">
        No {type === 'call' ? 'call analysis' : 'quality analysis'} available
      </p>
      <p className="text-xs mt-1">
        {canTranscribe
          ? 'Transcribe the recording first, then analyze the call'
          : 'Analysis may still be processing or unavailable for this conversation'}
      </p>
      {canTranscribe && onTranscribe && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={onTranscribe}
          disabled={isTranscribing}
        >
          {isTranscribing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
        </Button>
      )}
    </div>
  );
}
