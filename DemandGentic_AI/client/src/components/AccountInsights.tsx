import { useState } from 'react';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  TrendingUp,
  Users,
  Target,
  Lightbulb,
  Building2,
  Globe,
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AccountBrief {
  accountId: string;
  mainProducts?: Array;
  targetMarkets?: Array;
  buyerTitles?: string[];
  industries?: string[];
  painHypotheses?: Array;
  tailoredAngles?: {
    openingHook?: string;
    tailoredOffer?: string;
    caseStudy?: string;
  };
  confidence: number;
  generatedAt?: string;
}

interface AccountInsightsProps {
  accountId: string;
  accountName: string;
}

export function AccountInsights({ accountId, accountName }: AccountInsightsProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: brief, isLoading, error } = useQuery({
    queryKey: [`/api/accounts/${accountId}/brief`],
    queryFn: async () => {
      const response = await fetch(`/api/accounts/${accountId}/brief`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch brief');
      }
      return response.json();
    },
    retry: false,
  });

  const generateBriefMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/accounts/${accountId}/brief`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/brief`] });
      toast({
        title: "Account Brief Generated",
        description: `Strategic insights for ${accountName} have been generated with ${data.confidence}% confidence.`,
      });
      setIsGenerating(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Unable to generate account brief. Please try again.",
      });
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateBriefMutation.mutate();
  };

  if (isLoading) {
    return (
      
        
          
            
              
              Account Insights
            
          
          AI-powered strategic analysis
        
        
          
          
          
        
      
    );
  }

  if (error || !brief) {
    return (
      
        
          
            
              
              Account Insights
            
            
              {isGenerating ? (
                <>
                  
                  Generating...
                
              ) : (
                <>
                  
                  Generate Insights
                
              )}
            
          
          AI-powered strategic analysis
        
        
          
            
            
              No account brief available. Click "Generate Insights" to create AI-powered strategic analysis for {accountName}.
            
          
        
      
    );
  }

  const confidenceColor = brief.confidence >= 80 ? 'text-green-600 dark:text-green-400' : 
                          brief.confidence >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 
                          'text-orange-600 dark:text-orange-400';

  return (
    
      
        
          
            
            Account Insights
            
              {brief.confidence}% confidence
            
          
          
            {isGenerating ? (
              <>
                
                Regenerating...
              
            ) : (
              <>
                
                Regenerate
              
            )}
          
        
        
          AI-powered strategic analysis
          {brief.generatedAt && (
            
              • Generated {new Date(brief.generatedAt).toLocaleDateString()}
            
          )}
        
      
      
        {/* Main Products/Services */}
        {brief.mainProducts && brief.mainProducts.length > 0 && (
          
            
              
              Main Products & Services
            
            
              {brief.mainProducts.map((product, idx) => (
                
                  {product.name}
                  {product.desc}
                
              ))}
            
          
        )}

        {/* Target Markets */}
        {brief.targetMarkets && brief.targetMarkets.length > 0 && (
          
            
              
              Target Markets
            
            
              {brief.targetMarkets.map((market, idx) => (
                
                  {market.segment}
                  {market.geo}
                
              ))}
            
          
        )}

        {/* Buyer Personas */}
        {brief.buyerTitles && brief.buyerTitles.length > 0 && (
          
            
              
              Key Buyer Personas
            
            
              {brief.buyerTitles.map((title, idx) => (
                
                  {title}
                
              ))}
            
          
        )}

        {/* Industries Served */}
        {brief.industries && brief.industries.length > 0 && (
          
            
              
              Industries Served
            
            
              {brief.industries.map((industry, idx) => (
                
                  {industry}
                
              ))}
            
          
        )}

        {/* Pain Hypotheses */}
        {brief.painHypotheses && brief.painHypotheses.length > 0 && (
          
            
              
              Key Pain Points
            
            
              {brief.painHypotheses.map((hypothesis, idx) => (
                
                  {hypothesis.pain}
                  {hypothesis.proof}
                
              ))}
            
          
        )}

        {/* Tailored Outreach Angles */}
        {brief.tailoredAngles && (
          
            
              
              Tailored Outreach Angles
            
            
              {brief.tailoredAngles.openingHook && (
                
                  Opening Hook
                  {brief.tailoredAngles.openingHook}
                
              )}
              {brief.tailoredAngles.tailoredOffer && (
                
                  Tailored Offer
                  {brief.tailoredAngles.tailoredOffer}
                
              )}
              {brief.tailoredAngles.caseStudy && (
                
                  Relevant Case Study
                  {brief.tailoredAngles.caseStudy}
                
              )}
            
          
        )}
      
    
  );
}