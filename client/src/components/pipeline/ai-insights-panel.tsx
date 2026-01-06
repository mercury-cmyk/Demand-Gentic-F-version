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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI-Powered Insights
        </CardTitle>
        <CardDescription>
          Deal scoring, account analysis, and AI-generated recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading insights...</div>
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No AI insights available yet</p>
            <p className="text-sm mt-2">Insights will appear as AI analyzes this opportunity</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Insights */}
            {activeInsights.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Active Insights ({activeInsights.length})
                </h3>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {activeInsights.map((insight) => {
                      const Icon = getInsightIcon(insight.insightType);
                      const colorClass = getInsightColor(insight.insightType);
                      const confidenceBadge = getConfidenceBadge(insight.confidence);
                      
                      return (
                        <div
                          key={insight.id}
                          className="p-4 rounded-lg border hover-elevate"
                          data-testid={`insight-${insight.id}`}
                        >
                          <div className="flex gap-3">
                            <div className="flex-shrink-0">
                              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", colorClass)}>
                                <Icon className="h-5 w-5" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <Badge variant="outline" className="text-xs">
                                      {getInsightLabel(insight.insightType)}
                                    </Badge>
                                    <Badge variant={confidenceBadge.variant} className="text-xs">
                                      {confidenceBadge.label}
                                    </Badge>
                                  </div>
                                  <p className="font-medium text-sm">{insight.insightKey}</p>
                                </div>
                                <div className="flex-shrink-0 text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true })}
                                </div>
                              </div>
                              <p 
                                className={cn(
                                  "text-sm mb-3",
                                  insight.insightType === 'sentiment' && getSentimentColor(insight.insightValue),
                                  insight.insightType === 'urgency' && getUrgencyColor(insight.insightValue)
                                )}
                                data-testid={`insight-value-${insight.id}`}
                              >
                                {insight.insightValue}
                              </p>
                              {insight.source && (
                                <p className="text-xs text-muted-foreground mb-3">
                                  Source: {insight.source}
                                </p>
                              )}
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAcknowledge(insight.id)}
                                  disabled={updateStatusMutation.isPending}
                                  data-testid={`button-acknowledge-${insight.id}`}
                                >
                                  <ThumbsUp className="h-3 w-3 mr-1" />
                                  Acknowledge
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDismiss(insight.id)}
                                  disabled={updateStatusMutation.isPending}
                                  data-testid={`button-dismiss-${insight.id}`}
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Acknowledged Insights */}
            {acknowledgedInsights.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Acknowledged ({acknowledgedInsights.length})
                </h3>
                <div className="space-y-2">
                  {acknowledgedInsights.map((insight) => {
                    const Icon = getInsightIcon(insight.insightType);
                    const confidenceBadge = getConfidenceBadge(insight.confidence);
                    
                    return (
                      <div
                        key={insight.id}
                        className="p-3 rounded-lg border bg-muted/50"
                        data-testid={`insight-acknowledged-${insight.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {getInsightLabel(insight.insightType)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {confidenceBadge.label}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium">{insight.insightKey}</p>
                            <p className="text-sm text-muted-foreground">{insight.insightValue}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expired Insights */}
            {expiredInsights.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expired ({expiredInsights.length})
                </h3>
                <div className="space-y-2">
                  {expiredInsights.map((insight) => {
                    const Icon = getInsightIcon(insight.insightType);
                    
                    return (
                      <div
                        key={insight.id}
                        className="p-3 rounded-lg border bg-muted/30 opacity-60"
                        data-testid={`insight-expired-${insight.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {getInsightLabel(insight.insightType)}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Expired
                              </Badge>
                            </div>
                            <p className="text-sm font-medium">{insight.insightKey}</p>
                            <p className="text-sm text-muted-foreground">{insight.insightValue}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
