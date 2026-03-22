import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, Brain, ThumbsUp, ThumbsDown, X, TrendingUp, AlertTriangle,
  Zap, Target, MessageSquare, CheckCircle, Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DealInsight {
  id: string;
  opportunityId: string;
  insightType: string;
  insightKey: string;
  insightValue: string;
  confidence: number;
  source: string | null;
  status: 'active' | 'acknowledged' | 'dismissed' | 'expired';
  expiresAt: string | null;
  createdAt: string;
}

interface AIInsightsPanelProps {
  opportunityId: string;
  insights: DealInsight[];
  isLoading: boolean;
}

const getInsightIcon = (type: string) => {
  switch (type) {
    case 'sentiment':
      return MessageSquare;
    case 'intent':
      return Target;
    case 'urgency':
      return AlertTriangle;
    case 'next_action':
      return Zap;
    case 'stage_recommendation':
      return TrendingUp;
    case 'risk_flag':
      return AlertTriangle;
    default:
      return Sparkles;
  }
};

const getInsightColor = (type: string) => {
  switch (type) {
    case 'sentiment':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
    case 'intent':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
    case 'urgency':
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
    case 'next_action':
      return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
    case 'stage_recommendation':
      return 'bg-teal-100 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400';
    case 'risk_flag':
      return 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
  }
};

const getInsightLabel = (type: string) => {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

const getConfidenceBadge = (confidence: number) => {
  if (confidence >= 0.8) {
    return { label: 'High Confidence', variant: 'default' as const };
  } else if (confidence >= 0.5) {
    return { label: 'Medium Confidence', variant: 'secondary' as const };
  } else {
    return { label: 'Low Confidence', variant: 'outline' as const };
  }
};

const getSentimentColor = (value: string) => {
  switch (value.toLowerCase()) {
    case 'positive':
      return 'text-green-600 dark:text-green-400';
    case 'negative':
      return 'text-red-600 dark:text-red-400';
    case 'neutral':
      return 'text-gray-600 dark:text-gray-400';
    default:
      return '';
  }
};

const getUrgencyColor = (value: string) => {
  switch (value.toLowerCase()) {
    case 'high':
    case 'urgent':
      return 'text-red-600 dark:text-red-400';
    case 'medium':
    case 'moderate':
      return 'text-orange-600 dark:text-orange-400';
    case 'low':
      return 'text-gray-600 dark:text-gray-400';
    default:
      return '';
  }
};

export function AIInsightsPanel({ opportunityId, insights, isLoading }: AIInsightsPanelProps) {
  const { toast } = useToast();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ insightId, status }: { insightId: string; status: 'acknowledged' | 'dismissed' }) => {
      return await apiRequest("PUT", `/api/insights/${insightId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/opportunities/${opportunityId}/insights`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update insight status",
        variant: "destructive",
      });
    },
  });

  const handleAcknowledge = (insightId: string) => {
    updateStatusMutation.mutate({ insightId, status: 'acknowledged' });
  };

  const handleDismiss = (insightId: string) => {
    updateStatusMutation.mutate({ insightId, status: 'dismissed' });
  };

  const activeInsights = insights.filter(i => i.status === 'active');
  const acknowledgedInsights = insights.filter(i => i.status === 'acknowledged');
  const expiredInsights = insights.filter(i => i.status === 'expired');

  return (
    
      
        
          
          AI-Powered Insights
        
        
          Deal scoring, account analysis, and AI-generated recommendations
        
      
      
        {isLoading ? (
          
            Loading insights...
          
        ) : insights.length === 0 ? (
          
            
            No AI insights available yet
            Insights will appear as AI analyzes this opportunity
          
        ) : (
          
            {/* Active Insights */}
            {activeInsights.length > 0 && (
              
                
                  
                  Active Insights ({activeInsights.length})
                
                
                  
                    {activeInsights.map((insight) => {
                      const Icon = getInsightIcon(insight.insightType);
                      const colorClass = getInsightColor(insight.insightType);
                      const confidenceBadge = getConfidenceBadge(insight.confidence);
                      
                      return (
                        
                          
                            
                              
                                
                              
                            
                            
                              
                                
                                  
                                    
                                      {getInsightLabel(insight.insightType)}
                                    
                                    
                                      {confidenceBadge.label}
                                    
                                  
                                  {insight.insightKey}
                                
                                
                                  {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true })}
                                
                              
                              
                                {insight.insightValue}
                              
                              {insight.source && (
                                
                                  Source: {insight.source}
                                
                              )}
                              
                                 handleAcknowledge(insight.id)}
                                  disabled={updateStatusMutation.isPending}
                                  data-testid={`button-acknowledge-${insight.id}`}
                                >
                                  
                                  Acknowledge
                                
                                 handleDismiss(insight.id)}
                                  disabled={updateStatusMutation.isPending}
                                  data-testid={`button-dismiss-${insight.id}`}
                                >
                                  
                                  Dismiss
                                
                              
                            
                          
                        
                      );
                    })}
                  
                
              
            )}

            {/* Acknowledged Insights */}
            {acknowledgedInsights.length > 0 && (
              
                
                  
                  Acknowledged ({acknowledgedInsights.length})
                
                
                  {acknowledgedInsights.map((insight) => {
                    const Icon = getInsightIcon(insight.insightType);
                    const confidenceBadge = getConfidenceBadge(insight.confidence);
                    
                    return (
                      
                        
                          
                          
                            
                              
                                {getInsightLabel(insight.insightType)}
                              
                              
                                {confidenceBadge.label}
                              
                            
                            {insight.insightKey}
                            {insight.insightValue}
                          
                        
                      
                    );
                  })}
                
              
            )}

            {/* Expired Insights */}
            {expiredInsights.length > 0 && (
              
                
                  
                  Expired ({expiredInsights.length})
                
                
                  {expiredInsights.map((insight) => {
                    const Icon = getInsightIcon(insight.insightType);
                    
                    return (
                      
                        
                          
                          
                            
                              
                                {getInsightLabel(insight.insightType)}
                              
                              
                                Expired
                              
                            
                            {insight.insightKey}
                            {insight.insightValue}
                          
                        
                      
                    );
                  })}
                
              
            )}
          
        )}
      
    
  );
}