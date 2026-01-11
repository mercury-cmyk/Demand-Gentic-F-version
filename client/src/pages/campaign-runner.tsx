/**
 * Campaign Runner Page
 * 
 * Browser-based campaign execution via WebRTC.
 * This page must remain open to run AI calling campaigns.
 * 
 * All calls made through Telnyx WebRTC + OpenAI Realtime WebRTC.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useCampaignRunner } from '@/hooks/useCampaignRunner';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Phone,
  PhoneOff,
  Play,
  Pause,
  Square,
  SkipForward,
  Wifi,
  WifiOff,
  Volume2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Building,
  MessageSquare,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: string;
  type: string;
  totalContacts?: number;
  contactsCalled?: number;
}

export default function CampaignRunnerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Selected campaigns
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  
  // Telnyx credentials state
  const [telnyxCredentials, setTelnyxCredentials] = useState<{
    username?: string;
    password?: string;
  } | null>(null);

  // Fetch available AI campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    select: (data: Campaign[]) => data.filter(c => c.type === 'ai_agent' && c.status === 'active'),
  });

  // Fetch Telnyx credentials
  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        const response = await apiRequest('GET', '/api/telnyx/webrtc/credentials');
        const data = await response.json();
        setTelnyxCredentials({
          username: data.username,
          password: data.password,
        });
      } catch (err) {
        console.error('Failed to fetch Telnyx credentials:', err);
        toast({
          title: 'Error',
          description: 'Failed to load calling credentials. Please configure Telnyx settings.',
          variant: 'destructive',
        });
      }
    };
    fetchCredentials();
  }, [toast]);

  // Campaign runner hook
  const [runnerState, runnerActions] = useCampaignRunner({
    userId: String(user?.id || ''),
    username: user?.username || 'Unknown',
    campaignIds: selectedCampaignIds,
    telnyxCredentials: telnyxCredentials || {},
    openaiEphemeralEndpoint: '/api/openai/realtime/session',
    callerIdName: user?.username || 'AI Agent',
    onTaskStarted: (task) => {
      toast({
        title: 'Calling',
        description: `Calling ${task.contactFirstName || 'Contact'} at ${task.phoneNumber}`,
      });
    },
    onTaskCompleted: (task, disposition) => {
      toast({
        title: 'Call Complete',
        description: `${task.contactFirstName || 'Contact'}: ${disposition}`,
      });
    },
    onCampaignComplete: (campaignId) => {
      toast({
        title: 'Campaign Complete',
        description: `Campaign ${campaignId} has finished all calls.`,
      });
    },
    onError: (err) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Status badge color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'connected': return 'bg-blue-500';
      case 'running': return 'bg-green-500';
      case 'paused': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Handle campaign selection
  const toggleCampaign = (campaignId: string) => {
    setSelectedCampaignIds(prev => 
      prev.includes(campaignId)
        ? prev.filter(id => id !== campaignId)
        : [...prev, campaignId]
    );
  };

  // Can't run without credentials
  if (!telnyxCredentials) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuration Required</AlertTitle>
          <AlertDescription>
            Telnyx WebRTC credentials are not configured. Please set up your SIP trunk settings first.
            <Button variant="link" onClick={() => navigate('/settings/sip-trunk')}>
              Configure Now
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaign Runner</h1>
          <p className="text-muted-foreground">
            Run AI calling campaigns directly from your browser
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            {runnerState.status === 'disconnected' ? (
              <WifiOff className="h-4 w-4 text-red-500" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            <span className={getStatusColor(runnerState.status) + ' px-2 py-0.5 rounded text-white text-xs'}>
              {runnerState.status.toUpperCase()}
            </span>
          </Badge>
        </div>
      </div>

      {/* Important Notice */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Keep This Tab Open</AlertTitle>
        <AlertDescription>
          This page must remain open and active to run campaigns. 
          All calls are made from your browser using WebRTC.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Campaigns</CardTitle>
            <CardDescription>Choose which AI campaigns to run</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <p className="text-muted-foreground">Loading campaigns...</p>
            ) : campaigns.length === 0 ? (
              <p className="text-muted-foreground">No active AI campaigns found.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCampaignIds.includes(campaign.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent'
                    }`}
                    onClick={() => toggleCampaign(campaign.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{campaign.name}</span>
                      <Badge variant={selectedCampaignIds.includes(campaign.id) ? 'default' : 'outline'}>
                        {selectedCampaignIds.includes(campaign.id) ? 'Selected' : 'Select'}
                      </Badge>
                    </div>
                    {campaign.totalContacts && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {campaign.contactsCalled || 0} / {campaign.totalContacts} called
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Call */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Current Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runnerState.currentTask ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      {runnerState.currentTask.contactFirstName} {runnerState.currentTask.contactLastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {runnerState.currentTask.phoneNumber}
                    </p>
                  </div>
                </div>

                {runnerState.currentTask.companyName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{runnerState.currentTask.companyName}</span>
                  </div>
                )}

                {runnerState.currentTask.contactTitle && (
                  <p className="text-sm text-muted-foreground">
                    {runnerState.currentTask.contactTitle}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">
                    {Math.floor(runnerState.callDurationSeconds / 60)}:
                    {(runnerState.callDurationSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>

                <Separator />

                {/* Live Transcript */}
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Live Transcript
                  </p>
                  <ScrollArea className="h-32 rounded-md border p-2">
                    {runnerState.transcripts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Waiting for conversation...</p>
                    ) : (
                      <div className="space-y-2">
                        {runnerState.transcripts.slice(-10).map((t, i) => (
                          <div key={i} className={`text-sm ${t.role === 'assistant' ? 'text-blue-600' : 'text-green-600'}`}>
                            <span className="font-medium">{t.role === 'assistant' ? 'AI:' : 'Caller:'}</span>{' '}
                            {t.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={runnerActions.skipCurrentCall}
                  className="w-full"
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Skip Call
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <PhoneOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No active call</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats & Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Session Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{runnerState.stats.totalCallsMade}</p>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{runnerState.stats.successfulCalls}</p>
                <p className="text-sm text-muted-foreground">Successful</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{runnerState.stats.failedCalls}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{runnerState.stats.averageCallDuration}s</p>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
              </div>
            </div>

            {runnerState.stats.totalCallsMade > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Success Rate</p>
                <Progress 
                  value={(runnerState.stats.successfulCalls / runnerState.stats.totalCallsMade) * 100} 
                />
              </div>
            )}

            <Separator />

            {/* Controls */}
            <div className="space-y-3">
              {runnerState.status === 'disconnected' ? (
                <Button 
                  onClick={runnerActions.connect} 
                  disabled={selectedCampaignIds.length === 0}
                  className="w-full"
                >
                  <Wifi className="h-4 w-4 mr-2" />
                  Connect
                </Button>
              ) : runnerState.status === 'connected' ? (
                <Button 
                  onClick={runnerActions.start}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Calling
                </Button>
              ) : runnerState.status === 'running' ? (
                <div className="flex gap-2">
                  <Button 
                    onClick={runnerActions.pause}
                    variant="outline"
                    className="flex-1"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                  <Button 
                    onClick={runnerActions.stop}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </div>
              ) : runnerState.status === 'paused' ? (
                <div className="flex gap-2">
                  <Button 
                    onClick={runnerActions.resume}
                    className="flex-1"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                  <Button 
                    onClick={runnerActions.stop}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                </div>
              ) : null}

              {runnerState.status !== 'disconnected' && (
                <Button 
                  onClick={runnerActions.disconnect}
                  variant="outline"
                  className="w-full"
                >
                  <WifiOff className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              )}
            </div>

            {runnerState.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{runnerState.error.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
