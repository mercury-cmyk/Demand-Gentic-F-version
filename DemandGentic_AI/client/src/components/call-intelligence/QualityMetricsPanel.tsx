/**
 * Quality Metrics Panel Component
 *
 * Displays quality analysis including overall score, dimension scores,
 * sentiment, issues, recommendations, and feedback form for improving AI.
 */

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Lightbulb,
  MessageSquare,
  Target,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Send,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getQualityScoreColor,
  SENTIMENT_COLORS,
  type QualityDimensions,
  type QualityIssue,
  type QualityRecommendation,
  type DispositionReview,
  type CampaignAlignment,
  type FlowCompliance,
} from './types';

interface QualityMetricsPanelProps {
  analyzed: boolean;
  overallScore?: number;
  dimensions?: QualityDimensions;
  sentiment?: string;
  engagementLevel?: string;
  identityConfirmed?: boolean;
  qualificationMet?: boolean;
  issues?: QualityIssue[];
  recommendations?: QualityRecommendation[];
  dispositionReview?: DispositionReview;
  campaignAlignment?: CampaignAlignment;
  flowCompliance?: FlowCompliance;
  nextBestActions?: string[];
  className?: string;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  callSessionId?: string;
  onFeedbackSubmit?: (feedback: QualityFeedback) => void;
}

export interface QualityFeedback {
  callSessionId: string;
  rating: 'helpful' | 'not_helpful' | null;
  comment: string;
  analysisAccurate: boolean;
  dispositionCorrect: boolean;
}

export function QualityMetricsPanel({
  analyzed,
  overallScore,
  dimensions,
  sentiment,
  engagementLevel,
  identityConfirmed,
  qualificationMet,
  issues,
  recommendations,
  dispositionReview,
  campaignAlignment,
  flowCompliance,
  nextBestActions,
  className,
  onAnalyze,
  isAnalyzing,
  callSessionId,
  onFeedbackSubmit,
}: QualityMetricsPanelProps) {
  // Feedback state
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [analysisAccurate, setAnalysisAccurate] = useState(true);
  const [dispositionCorrect, setDispositionCorrect] = useState(true);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const handleSubmitFeedback = () => {
    if (onFeedbackSubmit && callSessionId) {
      onFeedbackSubmit({
        callSessionId,
        rating: feedbackRating,
        comment: feedbackComment,
        analysisAccurate,
        dispositionCorrect,
      });
      setFeedbackSubmitted(true);
    }
  };
  if (!analyzed) {
    return (
      
        
        
          No quality analysis available for this call
        
        {onAnalyze && (
          
            {isAnalyzing ? (
              <>
                
                Analyzing...
              
            ) : (
              <>
                
                Analyze Call Quality
              
            )}
          
        )}
      
    );
  }

  return (
    
      
        {/* Overall Score */}
        
          
            
              
              Overall Quality Score
            
          
          
            
              
                {overallScore ?? '--'}
              
              
                {sentiment && (
                  
                    Sentiment:
                    
                      {sentiment}
                    
                  
                )}
                {engagementLevel && (
                  
                    Engagement:
                    
                      {engagementLevel}
                    
                  
                )}
              
            

            {/* Quick indicators */}
            
              {identityConfirmed !== undefined && (
                
                  {identityConfirmed ?  : }
                  Identity {identityConfirmed ? 'Confirmed' : 'Not Confirmed'}
                
              )}
              {qualificationMet !== undefined && (
                
                  {qualificationMet ?  : }
                  {qualificationMet ? 'Qualified' : 'Not Qualified'}
                
              )}
            
          
        

        {/* Quality Dimensions */}
        {dimensions && Object.keys(dimensions).length > 0 && (
          
            
              
                
                  
                    
                      
                      Quality Dimensions
                    
                    
                  
                
              
              
                
                  {Object.entries(dimensions).map(([key, value]) => (
                    
                  ))}
                
              
            
          
        )}

        {/* Disposition Review */}
        {dispositionReview && (
          
            
              
                
                Disposition Review
              
            
            
              
                Assigned:
                {dispositionReview.assigned || 'None'}
              
              
                Expected:
                {dispositionReview.expected || 'N/A'}
              
              
                Accuracy:
                
                  {dispositionReview.accurate ? 'Accurate' : 'Inaccurate'}
                
              
              {dispositionReview.notes && dispositionReview.notes.length > 0 && (
                
                  {dispositionReview.notes.map((note, i) => (
                    {note}
                  ))}
                
              )}
            
          
        )}

        {/* Issues */}
        {issues && issues.length > 0 && (
          
            
              
                
                  
                    
                      
                      Issues ({issues.length})
                    
                    
                  
                
              
              
                
                  {issues.map((issue, index) => (
                    
                  ))}
                
              
            
          
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          
            
              
                
                  
                    
                      
                      Recommendations ({recommendations.length})
                    
                    
                  
                
              
              
                
                  {recommendations.map((rec, index) => (
                    
                  ))}
                
              
            
          
        )}

        {/* Next Best Actions */}
        {nextBestActions && nextBestActions.length > 0 && (
          
            
              
                
                Next Best Actions
              
            
            
              
                {nextBestActions.map((action, index) => (
                  
                    {index + 1}.
                    {action}
                  
                ))}
              
            
          
        )}

        {/* Campaign Alignment */}
        {campaignAlignment && campaignAlignment.score !== undefined && (
          
            
              
                
                  
                    
                      
                      Campaign Alignment
                    
                    
                  
                
              
              
                
                  
                  {campaignAlignment.contextUsage !== undefined && (
                    
                  )}
                  {campaignAlignment.talkingPointsCoverage !== undefined && (
                    
                  )}
                  {campaignAlignment.missedTalkingPoints && campaignAlignment.missedTalkingPoints.length > 0 && (
                    
                      Missed Talking Points:
                      
                        {campaignAlignment.missedTalkingPoints.map((point, i) => (
                          {point}
                        ))}
                      
                    
                  )}
                
              
            
          
        )}

        {/* Flow Compliance */}
        {flowCompliance && flowCompliance.score !== undefined && (
          
            
              
                
                  
                    
                      
                      Flow Compliance
                    
                    
                  
                
              
              
                
                  
                  {flowCompliance.missedSteps && flowCompliance.missedSteps.length > 0 && (
                    
                      Missed Steps:
                      
                        {flowCompliance.missedSteps.map((step, i) => (
                          {step}
                        ))}
                      
                    
                  )}
                
              
            
          
        )}

        {/* Feedback Section */}
        {analyzed && callSessionId && (
          
            
              
                
                Provide Feedback
              
            
            
              {feedbackSubmitted ? (
                
                  
                  Thank you for your feedback!
                
              ) : (
                <>
                  {/* Rating buttons */}
                  
                    Was this analysis helpful?
                    
                       setFeedbackRating('helpful')}
                        className="gap-1"
                      >
                        
                        Helpful
                      
                       setFeedbackRating('not_helpful')}
                        className="gap-1"
                      >
                        
                        Not Helpful
                      
                    
                  

                  {/* Accuracy checks */}
                  
                    
                       setAnalysisAccurate(e.target.checked)}
                        className="rounded"
                      />
                      Analysis accurate
                    
                    
                       setDispositionCorrect(e.target.checked)}
                        className="rounded"
                      />
                      Disposition correct
                    
                  

                  {/* Comment */}
                  
                     setFeedbackComment(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                  

                  {/* Submit button */}
                  
                    
                    Submit Feedback
                  
                
              )}
            
          
        )}
      
    
  );
}

// Helper Components

function DimensionBar({ label, value }: { label: string; value?: number }) {
  const score = value ?? 0;
  const color =
    score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    
      
        {label}
        {score}
      
      div]:${color}`)} />
    
  );
}

function IssueCard({ issue }: { issue: QualityIssue }) {
  const severityColors = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-gray-500',
  };

  return (
    
      
        
          {issue.severity}
        
        {issue.type}
      
      {issue.description}
      {issue.recommendation && (
        
          Suggestion: 
          {issue.recommendation}
        
      )}
    
  );
}

function RecommendationCard({ recommendation }: { recommendation: QualityRecommendation }) {
  return (
    
      
        {recommendation.category}
      
      {recommendation.suggestedChange}
      {recommendation.expectedImpact && (
        
          Expected Impact: 
          {recommendation.expectedImpact}
        
      )}
    
  );
}

function formatDimensionLabel(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

export default QualityMetricsPanel;