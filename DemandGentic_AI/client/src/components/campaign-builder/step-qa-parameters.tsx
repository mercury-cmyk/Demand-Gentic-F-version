import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Bot, Sparkles, Target, CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import { QueueIntelligenceConfig } from "@/components/campaigns/queue-intelligence-config";

interface QAParametersStepProps {
  data: any;
  onChange: (data: any) => void;
  onNext: (data: any) => void;
}

export function StepQAParameters({ data, onChange, onNext }: QAParametersStepProps) {
  const [qaParameters, setQaParameters] = useState(data.qaParameters || {});
  const [minScore, setMinScore] = useState(data.qaParameters?.min_score || 70);

  useEffect(() => {
    setQaParameters(data.qaParameters || {});
    setMinScore(data.qaParameters?.min_score || 70);
  }, [data.qaParameters]);

  // Get campaign context from previous steps
  const campaignObjective = data.campaignObjective || "";
  const productServiceInfo = data.productServiceInfo || "";
  const talkingPoints = data.talkingPoints || [];
  const targetAudienceDescription = data.targetAudienceDescription || "";
  const successCriteria = data.successCriteria || "";

  const handleNext = () => {
    const mergedQa = {
      ...(qaParameters || {}),
      min_score: minScore,
      use_campaign_context: true,
    };

    onNext({
      ...data,
      qaParameters: mergedQa,
    });
  };

  const hasContext = campaignObjective || productServiceInfo || talkingPoints.length > 0 || targetAudienceDescription || successCriteria;

  return (
    
      {/* Header */}
      
        AI Quality Assessment
        
          AI automatically evaluates lead quality based on your campaign context
        
      

      {/* AI-Powered Quality Banner */}
      
        
          
            
              
            
            
              
                
                Intelligent Lead Qualification
              
              
                AI analyzes each conversation against your campaign context to determine if a lead
                is qualified. No manual configuration needed - the AI understands your goals,
                product information, and success criteria automatically.
              
              
                
                  
                  Conversation Analysis
                
                
                  
                  Intent Detection
                
                
                  
                  Objection Tracking
                
                
                  
                  Outcome Classification
                
              
            
          
        
      

      {/* Campaign Context Preview */}
      
        
          
            
            Your Campaign Context
          
          
            AI will use this context to evaluate lead qualification
          
        
        
          {hasContext ? (
            <>
              {campaignObjective && (
                
                  Campaign Objective
                  {campaignObjective}
                
              )}

              {successCriteria && (
                
                  Success Criteria
                  {successCriteria}
                
              )}

              {targetAudienceDescription && (
                
                  Target Audience
                  {targetAudienceDescription}
                
              )}

              {talkingPoints.length > 0 && (
                
                  
                    
                    Key Talking Points
                  
                  
                    {talkingPoints.map((point: string, idx: number) => (
                      {point}
                    ))}
                  
                
              )}

              {productServiceInfo && (
                
                  Product/Service
                  {productServiceInfo}
                
              )}
            
          ) : (
            
              
              No campaign context defined
              Go back to the Messaging step to add campaign context for better AI qualification.
            
          )}
        
      

       {
          setQaParameters(nextQa);
          onChange({
            ...data,
            qaParameters: nextQa,
          });
        }}
      />

      {/* Qualification Threshold */}
      
        
          Qualification Threshold
          
            Set the minimum confidence score for AI to mark a lead as "Qualified"
          
        
        
          
            
               setMinScore(values[0])}
                min={0}
                max={100}
                step={5}
                className="w-full"
                data-testid="slider-min-score"
              />
            
            
               setMinScore(parseInt(e.target.value) || 0)}
                min={0}
                max={100}
                className="text-center"
                data-testid="input-min-score"
              />
            
            %
          
          
            
              ≥{minScore}% = Qualified
            
            
              40-{minScore - 1}% = Needs Review
            
            
              &lt;40% = Not Qualified
            
          
        
      

      {/* How AI Evaluates */}
      
        
          How AI Evaluates Leads
        
        
          
            
              1
              
                Conversation Analysis
                AI reviews the full call transcript to understand prospect responses and engagement level
              
            
            
              2
              
                Context Matching
                Compares conversation outcomes against your campaign objective and success criteria
              
            
            
              3
              
                Score Generation
                Generates a confidence score based on how well the outcome matches your success criteria
              
            
          
        
      

      {/* Next Button */}
      
        
          Continue to Scheduling
          
        
      
    
  );
}