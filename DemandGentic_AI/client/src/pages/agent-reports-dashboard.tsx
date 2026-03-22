import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Target, TrendingUp, Phone, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface LeaderboardEntry {
  agentId: string;
  agentFirstName: string | null;
  agentLastName: string | null;
  totalCalls: number;
  qualifiedLeads: number;
  acceptedLeads: number;
  rejectedLeads: number;
  pendingReview: number;
  conversionRate: string | null;
  avgCallDuration: number | null;
  calculatedAt: string;
  rank: number;
}

interface Goal {
  goalId: string;
  definition: {
    id: string;
    name: string;
    description: string | null;
    goalType: string;
  };
  targetValue: number;
  currentValue: number;
  progressPercentage: number;
  isComplete: boolean;
  reward: {
    id: string;
    name: string;
    description: string | null;
    rewardValue: string | null;
    rewardCurrency: string | null;
  } | null;
}

interface Period {
  id: string;
  label: string;
  startAt: string;
  endAt: string;
  status?: string;
}

export default function AgentReportsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const effectiveAgentId = selectedAgentId || user?.id;

  // Fetch current leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['/api/leaderboard/current'],
    refetchInterval: 60000, // Refresh every minute
    refetchIntervalInBackground: false,
  });

  // Fetch agent goals
  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ['/api/agents', effectiveAgentId, 'goals'],
    enabled: !!effectiveAgentId,
  });

  // Manual refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/leaderboard/refresh', {});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents', effectiveAgentId, 'goals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents', effectiveAgentId, 'reports'] });
      toast({
        title: "Stats Refreshed",
        description: "Leaderboard and stats have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: error.message || "Failed to refresh stats",
      });
    },
  });

  const currentAgent = leaderboardData?.leaderboard.find(
    (entry) => entry.agentId === effectiveAgentId
  );

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'campaign_manager';

  return (
    
      {/* Header */}
      
        
          Performance Dashboard
          
            Track your performance and progress towards goals
          
        
        {isAdminOrManager && (
           refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-stats"
          >
            
            Refresh Stats
          
        )}
      

      {/* Current Period Badge */}
      {leaderboardData?.period && (
        
          
            
              
                {leaderboardData.period.status === 'active' ? '🟢 Active Period' : leaderboardData.period.status}
              
              
                {leaderboardData.period.label}
                
                  {new Date(leaderboardData.period.startAt).toLocaleDateString()} -{' '}
                  {new Date(leaderboardData.period.endAt).toLocaleDateString()}
                
              
            
          
        
      )}

      {/* Personal Stats Summary */}
      {currentAgent ? (
        
          
            
              Current Rank
              
            
            
              #{currentAgent.rank}
              
                out of {leaderboardData?.leaderboard.length} agents
              
            
          

          
            
              Total Calls
              
            
            
              {currentAgent.totalCalls}
              
                Avg: {currentAgent.avgCallDuration ? `${Math.round(currentAgent.avgCallDuration)}s` : 'N/A'}
              
            
          

          
            
              Qualified Leads
              
            
            
              {currentAgent.qualifiedLeads}
              
                Accepted: {currentAgent.acceptedLeads}
              
            
          

          
            
              Conversion Rate
              
            
            
              
                {currentAgent.conversionRate ? `${parseFloat(currentAgent.conversionRate).toFixed(1)}%` : '0%'}
              
              
                Pending: {currentAgent.pendingReview}
              
            
          
        
      ) : leaderboardLoading ? (
        
          {[...Array(4)].map((_, i) => (
            
              
                
              
              
                
              
            
          ))}
        
      ) : null}

      {/* Goals Progress */}
      
        
          Your Goals
          
            Track progress towards your performance targets
          
        
        
          {goalsLoading ? (
            
              {[...Array(3)].map((_, i) => (
                
              ))}
            
          ) : goalsData?.goals && goalsData.goals.length > 0 ? (
            
              {goalsData.goals.map((goal) => (
                
                  
                    
                      {goal.definition.name}
                      {goal.definition.description && (
                        {goal.definition.description}
                      )}
                    
                    {goal.isComplete && (
                      
                        
                        Complete
                      
                    )}
                  
                  
                    
                    
                      {goal.currentValue}/{goal.targetValue}
                    
                  
                  {goal.reward && (
                    
                      
                      
                        Reward: {goal.reward.name}
                        {goal.reward.rewardValue && ` - ${goal.reward.rewardCurrency}${goal.reward.rewardValue}`}
                      
                    
                  )}
                
              ))}
            
          ) : (
            No goals set for current period
          )}
        
      

      {/* Leaderboard */}
      
        
          Leaderboard
          
            Top performers ranked by accepted leads and qualification rate
          
        
        
          {leaderboardLoading ? (
            
              {[...Array(5)].map((_, i) => (
                
              ))}
            
          ) : leaderboardData?.leaderboard && leaderboardData.leaderboard.length > 0 ? (
            
              {leaderboardData.leaderboard.slice(0, 10).map((entry) => (
                
                  
                    
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                    
                    
                      
                        {entry.agentFirstName && entry.agentLastName
                          ? `${entry.agentFirstName} ${entry.agentLastName}`
                          : 'Unknown Agent'}
                      
                      
                        
                          
                          {entry.totalCalls} calls
                        
                        
                          
                          {entry.qualifiedLeads} qualified
                        
                      
                    
                  
                  
                    
                      
                        
                        {entry.acceptedLeads}
                      
                      {entry.pendingReview > 0 && (
                        
                          
                          {entry.pendingReview}
                        
                      )}
                    
                    
                      {entry.conversionRate ? `${parseFloat(entry.conversionRate).toFixed(1)}%` : '0%'} conversion
                    
                  
                
              ))}
            
          ) : (
            No leaderboard data available
          )}
        
      
    
  );
}