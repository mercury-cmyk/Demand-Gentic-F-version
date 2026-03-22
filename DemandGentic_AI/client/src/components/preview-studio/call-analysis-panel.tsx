import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Brain,
  Heart,
  Lightbulb,
  MessageSquare,
  Target,
  Clock,
  Phone,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Sparkles,
  Shield,
} from "lucide-react";
import type { EvaluationReport } from "@/types/call-analysis";

interface CallAnalysisPanelProps {
  report: EvaluationReport | null;
  source: 'phone' | 'text' | null;
  isLoading?: boolean;
}

function VerdictBadge({ verdict }: { verdict: 'approve' | 'needs-edits' | 'reject' }) {
  const config = {
    approve: { label: 'Approved', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' },
    'needs-edits': { label: 'Needs Edits', variant: 'secondary' as const, className: 'bg-yellow-600 hover:bg-yellow-700 text-white' },
    reject: { label: 'Rejected', variant: 'destructive' as const, className: '' },
  };
  const { label, variant, className } = config[verdict];
  return {label};
}

function ScoreBar({ score, max, label }: { score: number; max: number; label: string }) {
  const percentage = (score / max) * 100;
  const color = percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    
      
        {label}
        {score}/{max}
      
      
        
      
    
  );
}

function TurnTagBadge({ tag }: { tag: string }) {
  const config: Record = {
    'good-move': { label: 'Good', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    'missed-opportunity': { label: 'Missed', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    'risk': { label: 'Risk', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    'unclear': { label: 'Unclear', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  };
  const { label, className } = config[tag] || config['unclear'];
  return {label};
}

export function CallAnalysisPanel({ report, source, isLoading }: CallAnalysisPanelProps) {
  if (isLoading) {
    return (
      
        
          
            
            
            
          
        
      
    );
  }

  if (!report) {
    return (
      
        
          
          No Analysis Available
          
            Complete a phone test or text simulation to generate an intelligent call analysis.
          
        
      
    );
  }

  const { executiveSummary, scorecard, voicemailDiscipline, humanityReport, intelligenceReport, timelineHighlights, objectionReview, promptImprovements } = report;

  return (
    
      
        {/* Header with Verdict */}
        
          
            
              
                
                  
                
                
                  Call Analysis Report
                  
                    {source === 'phone' ? 'Phone Test' : source === 'text' ? 'Text Simulation' : 'Analysis'} - 135-point evaluation
                  
                
              
              
            
          
          
            
              
                {scorecard.total}
                /135 points
              
              
                
                  
                    
                    What Went Well
                  
                  
                    {executiveSummary.whatWentWell.map((item, i) => (
                      
                        
                        {item}
                      
                    ))}
                  
                
                
                  
                    
                    What Hurt
                  
                  
                    {executiveSummary.whatHurtConversation.map((item, i) => (
                      
                        
                        {item}
                      
                    ))}
                    {executiveSummary.whatHurtConversation.length === 0 && (
                      Nothing significant
                    )}
                  
                
              
            
          
        

        {/* Voicemail Discipline - Critical */}
        
          
            
              
                
                Voicemail Discipline
              
              
                {voicemailDiscipline.passed ? 'PASSED' : 'FAILED'}
              
            
            
              Critical compliance check - agents must never leave voicemail
            
          
          {!voicemailDiscipline.passed && voicemailDiscipline.violations.length > 0 && (
            
              
                Violations:
                
                  {voicemailDiscipline.violations.map((v, i) => (
                    
                      
                      {v}
                    
                  ))}
                
              
            
          )}
        

        {/* Scorecard */}
        
          
            
              
              Scorecard
            
            
              Detailed breakdown of 8 evaluation metrics
            
          
          
            
              
              
              
              
              
              
              
              
            
          
        

        {/* Humanity & Intelligence Reports */}
        
          
            
              
                
                  
                  Humanity Report
                
                
                  {humanityReport.score}/{humanityReport.maxScore}
                
              
            
            
              {humanityReport.issues.length > 0 ? (
                
                  {humanityReport.issues.map((issue, i) => (
                    
                      
                      {issue}
                    
                  ))}
                
              ) : (
                
                  
                  Warm, professional tone maintained
                
              )}
            
          

          
            
              
                
                  
                  Intelligence Report
                
                
                  {intelligenceReport.score}/{intelligenceReport.maxScore}
                
              
            
            
              {intelligenceReport.issues.length > 0 ? (
                
                  {intelligenceReport.issues.map((issue, i) => (
                    
                      
                      {issue}
                    
                  ))}
                
              ) : (
                
                  
                  Good conversational intelligence
                
              )}
            
          
        

        {/* Timeline Highlights */}
        
          
            
              
              Timeline Highlights
            
            
              Key moments from the conversation (first 10 turns)
            
          
          
            
              {timelineHighlights.map((highlight, i) => (
                
                  
                    #{highlight.turn}
                    
                      {highlight.role === 'assistant' ? 'Agent' : 'User'}
                    
                  
                  {highlight.summary}
                  
                
              ))}
            
          
        

        {/* Objection Review */}
        {objectionReview.detected.length > 0 && (
          
            
              
                
                Objection Review
              
              
                {objectionReview.responseQuality}
              
            
            
              
                
                  Objections Detected:
                  
                    {objectionReview.detected.map((obj, i) => (
                      {obj}
                    ))}
                  
                
                {objectionReview.betterAlternatives.length > 0 && (
                  
                    Suggestions:
                    
                      {objectionReview.betterAlternatives.map((alt, i) => (
                        
                          
                          {alt}
                        
                      ))}
                    
                  
                )}
              
            
          
        )}

        {/* Prompt Improvements */}
        {promptImprovements.length > 0 && (
          
            
              
                
                Prompt Improvements
              
              
                Suggested changes to improve agent behavior
              
            
            
              
                {promptImprovements.map((improvement, i) => (
                  
                    
                      
                        {i + 1}
                        {improvement.reason}
                      
                    
                    
                      
                        
                          Issue: 
                          {improvement.originalLine}
                        
                        
                          Suggestion: 
                          {improvement.replacement}
                        
                      
                    
                  
                ))}
              
            
          
        )}
      
    
  );
}