/**
 * Voice Agent Testing Panel
 *
 * Quick test functionality and Preview Studio integration for virtual agents.
 * Shows recent test results and provides quick testing actions.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Phone,
  PhoneCall,
  Play,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Mic,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';

interface TestResult {
  id: string;
  agentId: string;
  status: 'passed' | 'failed' | 'warning';
  timestamp: string;
  duration: number;
  summary: string;
  details?: string;
}

export interface TestingPanelProps {
  agentId: string;
  agentName: string;
  className?: string;
}

export function TestingPanel({ agentId, agentName, className }: TestingPanelProps) {
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  // Fetch recent test results (mock data for now)
  const { data: testResults = [], isLoading: resultsLoading } = useQuery<TestResult[]>({
    queryKey: ['/api/virtual-agents', agentId, 'test-results'],
    queryFn: async () => {
      // Mock test results - replace with actual API call
      return [
        {
          id: '1',
          agentId,
          status: 'passed',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          duration: 45,
          summary: 'Opening and qualification successful',
        },
        {
          id: '2',
          agentId,
          status: 'warning',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          duration: 62,
          summary: 'Handled objection but missed opportunity',
        },
        {
          id: '3',
          agentId,
          status: 'passed',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
          duration: 38,
          summary: 'Successful cold call simulation',
        },
      ];
    },
    enabled: !!agentId && !!token,
  });

  // Start test call mutation
  const startTestCallMutation = useMutation({
    mutationFn: async ({ agentId, phoneNumber }: { agentId: string; phoneNumber?: string }) => {
      return await apiRequest('POST', '/api/test-calls/start', {
        agentId,
        phoneNumber,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Test Call Started',
        description: 'The test call is being initiated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents', agentId, 'test-results'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to start test call',
        variant: 'destructive',
      });
    },
  });

  const handleQuickTest = () => {
    startTestCallMutation.mutate({ agentId });
  };

  const handlePhoneTest = () => {
    if (!testPhoneNumber) {
      toast({
        title: 'Phone Number Required',
        description: 'Please enter a phone number for the test call',
        variant: 'destructive',
      });
      return;
    }
    startTestCallMutation.mutate({ agentId, phoneNumber: testPhoneNumber });
  };

  const StatusIcon = ({ status }: { status: TestResult['status'] }) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Agent Testing
        </CardTitle>
        <CardDescription>Test {agentName} with quick simulations or real calls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={handleQuickTest}
            disabled={startTestCallMutation.isPending}
            className="h-auto py-4 flex-col items-center gap-2"
          >
            {startTestCallMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            <span className="text-sm">Quick Test</span>
            <span className="text-xs text-primary-foreground/70">Simulated call</span>
          </Button>

          <Button variant="outline" className="h-auto py-4 flex-col items-center gap-2" asChild>
            <Link href={`/preview-studio?agent=${agentId}`}>
              <MessageSquare className="h-5 w-5" />
              <span className="text-sm">Preview Studio</span>
              <span className="text-xs text-muted-foreground">Full testing suite</span>
            </Link>
          </Button>
        </div>

        {/* Real Phone Test */}
        <div className="p-4 rounded-lg border bg-muted/20">
          <Label className="text-sm font-medium mb-2 block">Test with Real Phone</Label>
          <div className="flex gap-2">
            <Input
              placeholder="+1 (555) 123-4567"
              value={testPhoneNumber}
              onChange={e => setTestPhoneNumber(e.target.value)}
              type="tel"
            />
            <Button
              variant="secondary"
              onClick={handlePhoneTest}
              disabled={startTestCallMutation.isPending || !testPhoneNumber}
            >
              <PhoneCall className="h-4 w-4 mr-2" />
              Call
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Make a real test call to verify agent behavior
          </p>
        </div>

        {/* Recent Test Results */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium">Recent Results</Label>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/preview-studio?agent=${agentId}&tab=history`}>
                View All
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>

          {resultsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : testResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No test results yet</p>
              <p className="text-xs">Run a quick test to get started</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2 pr-4">
                {testResults.map(result => (
                  <div
                    key={result.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <StatusIcon status={result.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{format(new Date(result.timestamp), 'MMM d, h:mm a')}</span>
                        <span>•</span>
                        <span>{result.duration}s duration</span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        result.status === 'passed'
                          ? 'default'
                          : result.status === 'failed'
                            ? 'destructive'
                            : 'outline'
                      }
                      className={result.status === 'passed' ? 'bg-green-500' : ''}
                    >
                      {result.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Testing Tips */}
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">Testing Tips</p>
          <ul className="text-xs text-blue-600/80 dark:text-blue-400/80 space-y-1">
            <li>• Use Quick Test for basic functionality validation</li>
            <li>• Preview Studio offers scenario-based testing</li>
            <li>• Real phone tests verify SIP and voice quality</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
