/**
 * Coaching Recommendations
 *
 * AI-generated coaching recommendations based on call analysis.
 * User-triggered generation with configurable focus areas.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  GraduationCap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lightbulb,
  Sparkles,
  ArrowRight,
  Voicemail,
  MessageCircle,
  Copy,
} from 'lucide-react';
import { type DispositionIntelligenceFilters, type CoachingResponse, type PromptGuardrailResponse } from './types';

interface Campaign {
  id: string;
  name: string;
}

interface CoachingRecommendationsProps {
  filters: DispositionIntelligenceFilters;
  campaigns: Campaign[];
}

const FOCUS_AREAS = [
  { id: 'opening', label: 'Opening & Greeting' },
  { id: 'objection_handling', label: 'Objection Handling' },
  { id: 'closing', label: 'Closing Technique' },
  { id: 'voicemail_detection', label: 'Voicemail Detection' },
  { id: 'interruptions', label: 'Interruptions' },
  { id: 'qualification', label: 'Qualification Flow' },
];

export function CoachingRecommendations({ filters, campaigns }: CoachingRecommendationsProps) {
  const { toast } = useToast();
  const [focusAreas, setFocusAreas] = useState([]);
  const [result, setResult] = useState(null);
  const [guardrailExport, setGuardrailExport] = useState(null);

  const coachingMutation = useMutation({
    mutationFn: async () => {
      const body: any = { maxCalls: 250 };
      if (filters.campaignId !== 'all') body.campaignId = filters.campaignId;
      if (filters.startDate) body.startDate = filters.startDate;
      if (filters.endDate) body.endDate = filters.endDate;
      if (focusAreas.length > 0) body.focusAreas = focusAreas;
      const res = await apiRequest('POST', '/api/disposition-intelligence/generate-coaching', body);
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: 'Coaching Generated', description: `Analyzed ${data.metadata?.callsAnalyzed || 0} calls` });
    },
    onError: (error: any) => {
      toast({ title: 'Generation Failed', description: error.message || 'Could not generate coaching', variant: 'destructive' });
    },
  });

  const guardrailMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      params.append('maxCalls', '3000');
      params.append('maxKeywords', '25');
      params.append('maxPhrases', '25');
      if (filters.campaignId !== 'all') params.append('campaignId', filters.campaignId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      const res = await apiRequest('GET', `/api/disposition-intelligence/prompt-guardrails?${params}`);
      return res.json();
    },
    onSuccess: (data: PromptGuardrailResponse) => {
      setGuardrailExport(data);
      toast({
        title: 'Prompt Guardrails Ready',
        description: `Generated from ${data.summary.analyzedCalls} historical calls`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Export Failed',
        description: error.message || 'Could not build prompt guardrails',
        variant: 'destructive',
      });
    },
  });

  const copyGuardrails = async () => {
    const text = guardrailExport?.promptBlock || result?.promptGuardrails?.promptBlock;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: 'Prompt guardrail block copied to clipboard' });
    } catch {
      toast({ title: 'Copy Failed', description: 'Could not copy to clipboard', variant: 'destructive' });
    }
  };

  const toggleFocusArea = (id: string) => {
    setFocusAreas(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  return (
    
      {/* Configuration Panel */}
      
        
          
            
            AI Coaching Configuration
          
        
        
          
            Focus Areas (optional)
            
              {FOCUS_AREAS.map(area => (
                
                   toggleFocusArea(area.id)}
                  />
                  {area.label}
                
              ))}
            
          

          
             coachingMutation.mutate()}
              disabled={coachingMutation.isPending}
              className="gap-2"
            >
              {coachingMutation.isPending ? (
                
              ) : (
                
              )}
              {coachingMutation.isPending ? 'Analyzing Calls...' : 'Generate Coaching'}
            
            
              Analyzes up to 250 recent calls with transcripts
            
             guardrailMutation.mutate()}
              disabled={guardrailMutation.isPending}
              className="gap-2"
            >
              {guardrailMutation.isPending ? (
                
              ) : (
                
              )}
              Export Prompt Guardrails
            
          
        
      

      {/* Results */}
      {result && (
        
          
            {/* Metadata */}
            
              
              {result.metadata.callsAnalyzed} calls analyzed
              ·
              Generated {new Date(result.metadata.generatedAt).toLocaleString()}
            

            {/* Prompt Guardrails Export */}
            {(guardrailExport || result.promptGuardrails) && (
              
                
                  
                    
                      
                      Prompt Guardrails Export
                    
                    
                      
                      Copy Block
                    
                  
                
                
                  
                    Built from {guardrailExport?.summary.analyzedCalls || result.promptGuardrails?.summary.analyzedCalls || result.metadata.callsAnalyzed} calls. Paste this block into your unified SIP agent prompt configuration.
                  
                  
                
              
            )}

            {/* Top Issues */}
            {result.topIssues.length > 0 && (
              
                
                  
                    
                    Top Issues ({result.topIssues.length})
                  
                
                
                  {result.topIssues.map((issue, i) => (
                    
                      
                        {issue.issue}
                        
                          
                            {issue.impact} impact
                          
                          
                            {issue.frequency}x in {issue.affectedCalls} calls
                          
                        
                      
                      {issue.description}
                    
                  ))}
                
              
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              
                
                  
                    
                    Recommendations ({result.recommendations.length})
                  
                
                
                  {result.recommendations.map((rec, i) => (
                    
                      
                        {rec.area}
                        
                          {rec.priority} priority
                        
                      

                      
                        
                          
                            
                            Current Behavior
                          
                          {rec.currentBehavior}
                        
                        
                          
                            
                            Suggested Improvement
                          
                          {rec.suggestedImprovement}
                        
                      

                      
                        Expected Impact: {rec.expectedImpact}
                      

                      {/* Before/After Examples */}
                      {rec.examples.length > 0 && (
                        
                          Examples:
                          {rec.examples.map((ex, j) => (
                            
                              
                                Before: 
                                "{ex.before}"
                              
                              
                              
                                After: 
                                "{ex.after}"
                              
                            
                          ))}
                        
                      )}
                    
                  ))}
                
              
            )}

            {/* Prompt Improvements */}
            {result.promptImprovements.length > 0 && (
              
                
                  
                    
                    Prompt Improvements ({result.promptImprovements.length})
                  
                
                
                  {result.promptImprovements.map((pi, i) => (
                    
                      {pi.section}
                      
                        
                          Current
                          {pi.currentPromptSnippet}
                        
                        
                          Suggested
                          {pi.suggestedEdit}
                        
                      
                      {pi.rationale}
                    
                  ))}
                
              
            )}

            {/* Natural Language Patterns */}
            {(result.naturalLanguagePatterns.adopt.length > 0 || result.naturalLanguagePatterns.avoid.length > 0) && (
              
                {/* Adopt */}
                {result.naturalLanguagePatterns.adopt.length > 0 && (
                  
                    
                      
                        
                        Patterns to Adopt
                      
                    
                    
                      {result.naturalLanguagePatterns.adopt.map((p, i) => (
                        
                          "{p.pattern}"
                          {p.reason}
                          Example: {p.example}
                        
                      ))}
                    
                  
                )}

                {/* Avoid */}
                {result.naturalLanguagePatterns.avoid.length > 0 && (
                  
                    
                      
                        
                        Patterns to Avoid
                      
                    
                    
                      {result.naturalLanguagePatterns.avoid.map((p, i) => (
                        
                          "{p.pattern}"
                          {p.reason}
                          Use instead: "{p.alternative}"
                        
                      ))}
                    
                  
                )}
              
            )}

            {/* Voicemail Optimization */}
            {result.voicemailOptimization && (
              
                
                  
                    
                    Voicemail Detection Optimization
                  
                
                
                  
                    
                      Avg Detection Time
                      {result.voicemailOptimization.avgDetectionTime}s
                    
                  

                  {result.voicemailOptimization.missedVoicemailPhrases.length > 0 && (
                    
                      Missed Phrases to Add
                      
                        {result.voicemailOptimization.missedVoicemailPhrases.map((phrase, i) => (
                          
                            "{phrase}"
                          
                        ))}
                      
                    
                  )}

                  {result.voicemailOptimization.recommendations.length > 0 && (
                    
                      Recommendations
                      
                        {result.voicemailOptimization.recommendations.map((rec, i) => (
                          
                            
                            {rec}
                          
                        ))}
                      
                    
                  )}
                
              
            )}

            {/* Empty State */}
            {result.topIssues.length === 0 && result.recommendations.length === 0 && (
              
                
                No issues found. Agent performance looks good!
              
            )}
          
        
      )}

      {/* Initial Empty State */}
      {!result && !coachingMutation.isPending && (
        
          
          Generate AI Coaching
          Click the button above to analyze recent calls and get coaching recommendations
        
      )}
    
  );
}