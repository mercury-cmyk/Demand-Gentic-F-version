/**
 * Voice Agent Testing Panel
 *
 * Quick test functionality and Preview Studio integration for virtual agents.
 * Shows recent test results and provides quick testing actions.
 * 
 * Includes TRUE SIMULATION mode that bypasses all telephony.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Sparkles,
  Users,
  Zap,
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
  const [testMode, setTestMode] = useState<'simulation' | 'phone'>('simulation');
  const [selectedPersona, setSelectedPersona] = useState('neutral_dm');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  // Fetch available personas
  const { data: personasData } = useQuery<{ personas: { id: string; name: string; disposition: string }[] }>({
    queryKey: ['/api/simulations/personas'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/simulations/personas');
      return res.json();
    },
    enabled: !!token,
  });

  const personas = personasData?.personas || [];

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

  // Start test call mutation (for LIVE mode)
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

  // TRUE SIMULATION - No telephony
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/simulations/start', {
        campaignId: null, // Will use default campaign context
        accountId: null,  // Will use default account context
        virtualAgentId: agentId,
        personaPreset: selectedPersona,
        maxTurns: 12,
        runFullSimulation: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSimulationResult(data.session);
      toast({
        title: 'Simulation Complete',
        description: `Score: ${data.session.evaluation?.overallScore || 0}/100`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/virtual-agents', agentId, 'test-results'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Simulation Failed',
        description: error.message || 'Failed to run simulation',
        variant: 'destructive',
      });
    },
  });

  const handleQuickTest = () => {
    if (testMode === 'simulation') {
      startSimulationMutation.mutate();
    } else {
      startTestCallMutation.mutate({ agentId });
    }
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
        {/* Test Mode Toggle */}
        <Tabs value={testMode} onValueChange={(v) => setTestMode(v as 'simulation' | 'phone')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="simulation" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Simulation
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Live Call
            </TabsTrigger>
          </TabsList>

          <TabsContent value="simulation" className="mt-4 space-y-4">
            {/* Simulation Mode - NO PHONE REQUIRED */}
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">No Phone Required</span>
              </div>
              <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-1">
                True simulation - bypasses all telephony
              </p>
            </div>

            {/* Persona Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                <Users className="h-4 w-4 inline mr-1" />
                Simulated Human
              </Label>
              <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                <SelectTrigger>
                  <SelectValue placeholder="Select persona" />
                </SelectTrigger>
                <SelectContent>
                  {personas.length > 0 ? personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>{p.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">{p.disposition}</Badge>
                    </SelectItem>
                  )) : (
                    <>
                      <SelectItem value="friendly_dm">Friendly Decision Maker</SelectItem>
                      <SelectItem value="skeptical_dm">Skeptical Decision Maker</SelectItem>
                      <SelectItem value="hostile_dm">Hostile Decision Maker</SelectItem>
                      <SelectItem value="gatekeeper_assistant">Gatekeeper (Assistant)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleQuickTest}
              disabled={startSimulationMutation.isPending}
              className="w-full"
            >
              {startSimulationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Run Simulation
            </Button>

            {/* Simulation Result */}
            {simulationResult?.evaluation && (
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Last Result</span>
                  <Badge variant={simulationResult.evaluation.overallScore >= 70 ? 'default' : 'secondary'}>
                    {simulationResult.evaluation.overallScore}/100
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {simulationResult.transcript?.length || 0} turns • {simulationResult.evaluation.conversationStages?.join(' → ')}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="phone" className="mt-4 space-y-4">
            {/* Phone Test Mode - LIVE */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Live mode requires a phone number and uses real telephony.
              </p>
            </div>

            {/* Real Phone Test */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={testPhoneNumber}
                  onChange={e => setTestPhoneNumber(e.target.value)}
                  type="tel"
                />
                <Button
                  variant="default"
                  onClick={handlePhoneTest}
                  disabled={startTestCallMutation.isPending || !testPhoneNumber}
                >
                  <PhoneCall className="h-4 w-4 mr-2" />
                  Call
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-3">
          <Button variant="outline" className="h-auto py-4 flex-col items-center gap-2" asChild>
            <Link href={`/preview-studio?agent=${agentId}`}>
              <MessageSquare className="h-5 w-5" />
              <span className="text-sm">Preview Studio</span>
              <span className="text-xs text-muted-foreground">Full testing suite with all modes</span>
            </Link>
          </Button>
        </div>

        {/* REMOVED: Old phone test section - now in tabs above */}

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
