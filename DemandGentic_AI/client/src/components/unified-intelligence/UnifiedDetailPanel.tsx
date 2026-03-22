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
      
        
          
          
          
          
        
      
    );
  }

  // Empty state
  if (!conversation) {
    return (
      
        
          
          Select a conversation
          Choose a conversation from the list to view details
        
      
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
    
      
        
          {/* Header Section */}
          

          

          {/* Tabbed Content */}
          
            
              
                
                Overview
              
              
                
                Transcript
              
              
                
                Analysis
              
              
                
                Quality
              
            

            {/* Overview Tab */}
            
              {/* Action Buttons: Analyze / Transcribe */}
              {(canAnalyze || canTranscribe || canPushToShowcase) && (
                
                  {canAnalyze && (
                     onAnalyze?.(conversation.id)}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        
                      ) : (
                        
                      )}
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Call'}
                    
                  )}
                  {canTranscribe && (
                     onTranscribe?.(conversation.id)}
                      disabled={isTranscribing}
                    >
                      {isTranscribing ? (
                        
                      ) : (
                        
                      )}
                      {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
                    
                  )}
                  {canPushToShowcase && (
                    
                  )}
                
              )}

              {/* Call History (when contact has multiple calls) */}
              {hasCallHistory && (
                
                  
                    
                    Call History ({conversation.callCount} calls to this contact)
                  
                  
                    {conversation.callHistory!.map((entry, idx) => (
                       onSelectHistoryCall?.(entry.id)}
                      >
                        
                          #{idx + 1}
                          {entry.status}
                          {entry.disposition && (
                            
                              {entry.disposition.replace(/_/g, ' ')}
                            
                          )}
                        
                        
                          {entry.hasTranscript && }
                          {entry.hasRecording && }
                          {entry.hasAnalysis && }
                          {entry.duration && (
                            {Math.floor(entry.duration / 60)}:{String(entry.duration % 60).padStart(2, '0')}
                          )}
                          {format(new Date(entry.createdAt), 'MMM d, HH:mm')}
                        
                      
                    ))}
                  
                
              )}

              {/* Agent Learning Pipeline - Prominently mapped here */}
              {(learningIssues.length > 0 || learningRecommendations.length > 0) && (
                
                   
                
              )}

              {/* Recording */}
              
                
                  
                  Recording
                
                {conversation.recording.url ? (
                  
                    
                      
                      Your browser does not support audio playback.
                    
                    
                      
                      Open Recording URL
                    
                  
                ) : (
                  
                    {conversation.recording.available ? 'Recording stored but URL not available' : 'No recording available for this call'}
                  
                )}
              

              {/* Quick Summary */}
              {conversation.callAnalysis.summaryText && (
                
                  Call Summary
                  
                    {conversation.callAnalysis.summaryText}
                  
                
              )}

              {/* Transcript Preview */}
              
                
                  
                  Transcript Preview
                
                
              
            

            {/* Full Transcript Tab */}
            
              {hasTranscriptContent ? (
                
              ) : canTranscribe ? (
                
                  
                  No transcript available
                  A recording exists — transcription can be generated
                   onTranscribe?.(conversation.id)}
                    disabled={isTranscribing}
                  >
                    {isTranscribing ? (
                      
                    ) : (
                      
                    )}
                    {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
                  
                
              ) : (
                
                  
                  No transcript available
                  No recording available to generate transcript from
                
              )}
            

            {/* Call Analysis Tab */}
            
              {hasCallAnalysis ? (
                
              ) : canAnalyze ? (
                
                  
                  No analysis yet — transcript is available
                   onAnalyze?.(conversation.id)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      
                    ) : (
                      
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze This Call'}
                  
                
              ) : (
                 onTranscribe?.(conversation.id)} isTranscribing={isTranscribing} />
              )}
            

            {/* Quality Analysis Tab */}
            
              {hasQualityAnalysis ? (
                
              ) : (
                 onTranscribe?.(conversation.id)} isTranscribing={isTranscribing} />
              )}
            
          
        
      
    
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
    
      {/* Contact & Company */}
      
        
          
            
            {conversation.contact.name}
          
          
            
            {conversation.contact.company}
            {conversation.contact.jobTitle && (
              <>
                •
                {conversation.contact.jobTitle}
              
            )}
          
          {conversation.contact.phone && (
            
              
              {conversation.contact.phone}
            
          )}
        
        
          
            {isTest ? 'Test' : 'Production'}
          
          {conversation.agentType === 'ai' && (
            {conversation.agentName || 'AI Agent'}
          )}
        
      

      {/* Metadata Row */}
      
        
          
          {conversation.campaign.name}
        
        
          
          {format(new Date(conversation.createdAt), 'MMM d, yyyy HH:mm')}
        
        {conversation.durationSec !== undefined && conversation.durationSec > 0 && (
          
            
            
              {Math.floor(conversation.durationSec / 60)}:{String(conversation.durationSec % 60).padStart(2, '0')}
            
          
        )}
      

      {/* Status Badges */}
      
        {conversation.status}
        {conversation.result && (
          {conversation.result}
        )}
        {conversation.disposition && (
          
        )}
      
    
  );
}

function DispositionBadge({ disposition }: { disposition: string }) {
  const config: Record = {
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
    
      {disposition.replace(/_/g, ' ')}
    
  );
}

function EmptyAnalysisState({ type, canTranscribe, onTranscribe, isTranscribing }: { type: 'call' | 'quality'; canTranscribe?: boolean; onTranscribe?: () => void; isTranscribing?: boolean }) {
  return (
    
      
      
        No {type === 'call' ? 'call analysis' : 'quality analysis'} available
      
      
        {canTranscribe
          ? 'Transcribe the recording first, then analyze the call'
          : 'Analysis may still be processing or unavailable for this conversation'}
      
      {canTranscribe && onTranscribe && (
        
          {isTranscribing ? (
            
          ) : (
            
          )}
          {isTranscribing ? 'Transcribing...' : 'Transcribe from Recording'}
        
      )}
    
  );
}