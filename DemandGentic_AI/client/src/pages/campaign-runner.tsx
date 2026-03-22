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
  const [selectedCampaignIds, setSelectedCampaignIds] = useState([]);
  
  // Telnyx credentials state
  const [telnyxCredentials, setTelnyxCredentials] = useState(null);

  // Fetch available AI campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
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
      
        
          
          Configuration Required
          
            Telnyx WebRTC credentials are not configured. Please set up your SIP trunk settings first.
             navigate('/settings/sip-trunk')}>
              Configure Now
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          Campaign Runner
          
            Run AI calling campaigns directly from your browser
          
        
        
          
            {runnerState.status === 'disconnected' ? (
              
            ) : (
              
            )}
            
              {runnerState.status.toUpperCase()}
            
          
        
      

      {/* Important Notice */}
      
        
        Keep This Tab Open
        
          This page must remain open and active to run campaigns.
          All calls are made from your browser using WebRTC.
        
      

      {/* Stall Reason Warning */}
      {runnerState.stallReason && (
        
          
          Campaign Stalled
          {runnerState.stallReason}
        
      )}

      
        {/* Campaign Selection */}
        
          
            Select Campaigns
            Choose which AI campaigns to run
          
          
            {campaignsLoading ? (
              Loading campaigns...
            ) : campaigns.length === 0 ? (
              No active AI campaigns found.
            ) : (
              
                {campaigns.map((campaign) => (
                   toggleCampaign(campaign.id)}
                  >
                    
                      {campaign.name}
                      
                        {selectedCampaignIds.includes(campaign.id) ? 'Selected' : 'Select'}
                      
                    
                    {campaign.totalContacts && (
                      
                        {campaign.contactsCalled || 0} / {campaign.totalContacts} called
                      
                    )}
                  
                ))}
              
            )}
          
        

        {/* Current Call */}
        
          
            
              
              Current Call
            
          
          
            {runnerState.currentTask ? (
              
                
                  
                    
                  
                  
                    
                      {runnerState.currentTask.contactFirstName} {runnerState.currentTask.contactLastName}
                    
                    
                      {runnerState.currentTask.phoneNumber}
                    
                  
                

                {runnerState.currentTask.companyName && (
                  
                    
                    {runnerState.currentTask.companyName}
                  
                )}

                {runnerState.currentTask.contactTitle && (
                  
                    {runnerState.currentTask.contactTitle}
                  
                )}

                
                  
                  
                    {Math.floor(runnerState.callDurationSeconds / 60)}:
                    {(runnerState.callDurationSeconds % 60).toString().padStart(2, '0')}
                  
                

                

                {/* Live Transcript */}
                
                  
                    
                    Live Transcript
                  
                  
                    {runnerState.transcripts.length === 0 ? (
                      Waiting for conversation...
                    ) : (
                      
                        {runnerState.transcripts.slice(-10).map((t, i) => (
                          
                            {t.role === 'assistant' ? 'AI:' : 'Caller:'}{' '}
                            {t.text}
                          
                        ))}
                      
                    )}
                  
                

                
                  
                  Skip Call
                
              
            ) : (
              
                
                No active call
              
            )}
          
        

        {/* Stats & Controls */}
        
          
            Session Stats
          
          
            
              
                {runnerState.stats.totalCallsMade}
                Total Calls
              
              
                {runnerState.stats.successfulCalls}
                Successful
              
              
                {runnerState.stats.failedCalls}
                Failed
              
              
                {runnerState.stats.averageCallDuration}s
                Avg Duration
              
            

            {runnerState.stats.totalCallsMade > 0 && (
              
                Success Rate
                
              
            )}

            

            {/* Controls */}
            
              {runnerState.status === 'disconnected' ? (
                
                  
                  Connect
                
              ) : runnerState.status === 'connected' ? (
                
                  
                  Start Calling
                
              ) : runnerState.status === 'running' ? (
                
                  
                    
                    Pause
                  
                  
                    
                    Stop
                  
                
              ) : runnerState.status === 'paused' ? (
                
                  
                    
                    Resume
                  
                  
                    
                    Stop
                  
                
              ) : null}

              {runnerState.status !== 'disconnected' && (
                
                  
                  Disconnect
                
              )}
            

            {runnerState.error && (
              
                
                {runnerState.error.message}
              
            )}
          
        
      
    
  );
}