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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const effectiveAgentId = selectedAgentId || user?.id;

  // Fetch current leaderboard
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{
    period: Period | null;
    leaderboard: LeaderboardEntry[];
    lastUpdated: string;
  }>({
    queryKey: ['/api/leaderboard/current'],
    refetchInterval: 60000, // Refresh every minute
    refetchIntervalInBackground: false,
  });

  // Fetch agent goals
  const { data: goalsData, isLoading: goalsLoading } = useQuery<{
    period: Period | null;
    goals: Goal[];
    overallProgress: number;
  }>({
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
    <div className="container mx-auto p-6 space-y-6" data-testid="page-agent-reports">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Performance Dashboard</h1>
          <p className="text-muted-foreground">
            Track your performance and progress towards goals
          </p>
        </div>
        {isAdminOrManager && (
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-stats"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Stats
          </Button>
        )}
      </div>

      {/* Current Period Badge */}
      {leaderboardData?.period && (
        <Card data-testid="card-current-period">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-lg px-3 py-1" data-testid="badge-period-status">
                {leaderboardData.period.status === 'active' ? '🟢 Active Period' : leaderboardData.period.status}
              </Badge>
              <div>
                <p className="font-semibold">{leaderboardData.period.label}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(leaderboardData.period.startAt).toLocaleDateString()} -{' '}
                  {new Date(leaderboardData.period.endAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal Stats Summary */}
      {currentAgent ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-stat-rank">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Rank</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-agent-rank">#{currentAgent.rank}</div>
              <p className="text-xs text-muted-foreground">
                out of {leaderboardData?.leaderboard.length} agents
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-calls">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-calls">{currentAgent.totalCalls}</div>
              <p className="text-xs text-muted-foreground">
                Avg: {currentAgent.avgCallDuration ? `${Math.round(currentAgent.avgCallDuration)}s` : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-qualified">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Qualified Leads</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-qualified-leads">{currentAgent.qualifiedLeads}</div>
              <p className="text-xs text-muted-foreground">
                Accepted: {currentAgent.acceptedLeads}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-conversion">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-conversion-rate">
                {currentAgent.conversionRate ? `${parseFloat(currentAgent.conversionRate).toFixed(1)}%` : '0%'}
              </div>
              <p className="text-xs text-muted-foreground">
                Pending: {currentAgent.pendingReview}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : leaderboardLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Goals Progress */}
      <Card data-testid="card-goals-progress">
        <CardHeader>
          <CardTitle>Your Goals</CardTitle>
          <CardDescription>
            Track progress towards your performance targets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {goalsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : goalsData?.goals && goalsData.goals.length > 0 ? (
            <div className="space-y-6">
              {goalsData.goals.map((goal) => (
                <div key={goal.goalId} className="space-y-2" data-testid={`goal-${goal.definition.goalType}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{goal.definition.name}</p>
                      {goal.definition.description && (
                        <p className="text-sm text-muted-foreground">{goal.definition.description}</p>
                      )}
                    </div>
                    {goal.isComplete && (
                      <Badge variant="default" data-testid="badge-goal-complete">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress 
                      value={goal.progressPercentage} 
                      className="flex-1" 
                      data-testid={`progress-${goal.definition.goalType}`}
                    />
                    <span className="text-sm font-medium w-16 text-right" data-testid={`text-progress-${goal.definition.goalType}`}>
                      {goal.currentValue}/{goal.targetValue}
                    </span>
                  </div>
                  {goal.reward && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Trophy className="h-3 w-3" />
                      <span>
                        Reward: {goal.reward.name}
                        {goal.reward.rewardValue && ` - ${goal.reward.rewardCurrency}${goal.reward.rewardValue}`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No goals set for current period</p>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card data-testid="card-leaderboard">
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>
            Top performers ranked by accepted leads and qualification rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : leaderboardData?.leaderboard && leaderboardData.leaderboard.length > 0 ? (
            <div className="space-y-3">
              {leaderboardData.leaderboard.slice(0, 10).map((entry) => (
                <div
                  key={entry.agentId}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    entry.agentId === effectiveAgentId ? 'bg-accent/50 border-primary' : 'hover-elevate'
                  }`}
                  data-testid={`leaderboard-entry-${entry.rank}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold w-8 text-center" data-testid={`text-rank-${entry.rank}`}>
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                    </div>
                    <div>
                      <p className="font-semibold" data-testid={`text-agent-name-${entry.rank}`}>
                        {entry.agentFirstName && entry.agentLastName
                          ? `${entry.agentFirstName} ${entry.agentLastName}`
                          : 'Unknown Agent'}
                      </p>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span data-testid={`text-calls-${entry.rank}`}>
                          <Phone className="inline h-3 w-3 mr-1" />
                          {entry.totalCalls} calls
                        </span>
                        <span data-testid={`text-qualified-${entry.rank}`}>
                          <Target className="inline h-3 w-3 mr-1" />
                          {entry.qualifiedLeads} qualified
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-2 items-center justify-end mb-1">
                      <Badge variant="default" data-testid={`badge-accepted-${entry.rank}`}>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {entry.acceptedLeads}
                      </Badge>
                      {entry.pendingReview > 0 && (
                        <Badge variant="outline" data-testid={`badge-pending-${entry.rank}`}>
                          <Clock className="mr-1 h-3 w-3" />
                          {entry.pendingReview}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-rate-${entry.rank}`}>
                      {entry.conversionRate ? `${parseFloat(entry.conversionRate).toFixed(1)}%` : '0%'} conversion
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No leaderboard data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
