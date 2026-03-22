/**
 * Phone Campaign Panel Component
 *
 * Phone-specific functionality panel for campaign management.
 * Includes queue statistics, agent assignment, and AI call controls.
 */

import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  UserPlus,
  Phone,
  PhoneOutgoing,
  Play,
  Pause,
  Bot,
  Loader2,
  AlertCircle,
  BarChart,
  RefreshCw,
  Zap,
  Mic,
  Check,
  Brain,
  MoreHorizontal,
} from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest, getAuthHeaders } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InvalidRecordsModal } from './invalid-records-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface QueueStats {
  total: number;
  queued: number;
  inProgress: number;
  completed: number;
  removed: number;
  invalid: number;
  removedBreakdown: Record;
  agents: number;
  suppression?: {
    totalSuppressed: number;
    suppressionRate: number;
    suppressedByAccount: number;
    suppressedByContact: number;
    suppressedByDomain: number;
    suppressedByEmail: number;
  };
}

export interface PhoneCampaignPanelProps {
  campaign: {
    id: string | number;
    name: string;
    status: string;
    dialMode?: string;
    type: string;
    maxConcurrentWorkers?: number;
    assignedVoices?: { id: string; name: string }[];
  };
  queueStats?: QueueStats;
  onAssignAgents?: () => void;
  onToggleStatus?: () => void;
  isToggling?: boolean;
  className?: string;
}

export function PhoneCampaignPanel({
  campaign,
  queueStats,
  onAssignAgents,
  onToggleStatus,
  isToggling,
  className,
}: PhoneCampaignPanelProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false);
  const [invalidModalOpen, setInvalidModalOpen] = useState(false);
  const [workerCount, setWorkerCount] = useState(campaign.maxConcurrentWorkers || 1);

  // Scale Workers Mutation
  const updateScaleMutation = useMutation({
    mutationFn: async (count: number) => {
      const res = await apiRequest("PATCH", `/api/campaigns/${campaign.id}`, {
        maxConcurrentWorkers: count
      });
      if (!res.ok) throw new Error("Failed to update capacity");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: "Deployment Capacity Scaled Successfully" });
      setScaleDialogOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Scaling Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // === Voice Assignment Logic ===
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [selectedVoices, setSelectedVoices] = useState(
    campaign.assignedVoices || []
  );

  // Audio preview state
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState(null);
  const audioRef = useRef(null);

  // Play voice preview
  const playVoicePreview = async (voice: any) => {
    if (playingVoiceId === voice.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setLoadingVoiceId(voice.id);

    try {
      const response = await fetch('/api/voice-providers/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          voiceId: voice.id,
          provider: voice.provider || 'gemini',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preview');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingVoiceId(null);
        setLoadingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setPlayingVoiceId(null);
        setLoadingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Preview Failed",
          description: "Could not play voice preview",
          variant: "destructive",
        });
      };

      await audio.play();
      setPlayingVoiceId(voice.id);
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: "Preview Error",
        description: "Failed to load voice preview",
        variant: "destructive",
      });
    } finally {
      setLoadingVoiceId(null);
    }
  };

  // Fetch available voices
  const { data: voiceOptionsData } = useQuery({
    queryKey: ['voice-options'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/voice-options');
      return res.json();
    },
    enabled: voiceDialogOpen, // Only fetch when dialog is open
  });

  const voiceOptions = voiceOptionsData?.data || [];

  // Update Voices Mutation
  const updateVoicesMutation = useMutation({
    mutationFn: async (voices: { id: string; name: string }[]) => {
      const res = await apiRequest('PATCH', `/api/campaigns/${campaign.id}`, {
        assignedVoices: voices,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      toast({ title: "Voices Assigned Successfully" });
      setVoiceDialogOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: "Voice Assignment Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const toggleVoice = (voiceId: string, voiceName: string) => {
    setSelectedVoices(prev => {
      const exists = prev.find(v => v.id === voiceId);
      if (exists) {
        return prev.filter(v => v.id !== voiceId);
      } else {
        return [...prev, { id: voiceId, name: voiceName }];
      }
    });
  };

  const isAiAgent = campaign.dialMode === 'ai_agent' || campaign.dialMode === 'sql';

  // Sync Queue mutation - re-populates queue from assigned audience list
  const syncQueueMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/queue/populate`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}/queue`] });
      const stats = data.stats;
      if (data.enqueuedCount > 0) {
        toast({
          title: 'Queue Synced',
          description: `Enqueued ${data.enqueuedCount} contacts.`,
        });
      } else if (stats) {
        // Show detailed breakdown so user knows WHY no contacts were enqueued
        const parts: string[] = [];
        if (stats.unique === 0) parts.push('No contacts found in assigned lists');
        if (stats.droppedNoAccount > 0) parts.push(`${stats.droppedNoAccount} have no account linked`);
        if (stats.droppedNoPhone > 0) parts.push(`${stats.droppedNoPhone} have no phone number`);
        if (stats.alreadyQueued > 0) parts.push(`${stats.alreadyQueued} already in queue`);
        toast({
          title: '0 Contacts Enqueued',
          description: stats.unique === 0
            ? `Lists contain ${stats.rawTotal} raw records but 0 resolved to contacts. Check that your lists have valid contact or account IDs.`
            : `${stats.unique} contacts found. ${parts.join(', ')}.`,
          variant: 'destructive',
          duration: 15000,
        });
      } else {
        toast({
          title: 'Queue Synced',
          description: data.message || 'No new contacts to add.',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Queue Sync Failed',
        description: error.message || 'Failed to sync queue from audience list',
        variant: 'destructive',
      });
    },
  });

  const handleSyncQueue = () => {
    if (confirm('Sync queue from audience list? This will add any missing contacts to the queue.')) {
      syncQueueMutation.mutate(campaign.id.toString());
    }
  };

  // AI Calls mutation
  const startAiCallsMutation = useMutation({
    mutationFn: async ({ campaignId, limit }: { campaignId: string; limit: number }) => {
      return await apiRequest('POST', '/api/ai-calls/batch-start', {
        campaignId,
        limit,
        delayBetweenCalls: 3000,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns/queue-stats'] });
      toast({
        title: 'AI Calls Started',
        description: `Started ${data.callsInitiated || 0} AI calls. ${data.skipped || 0} contacts skipped.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error Starting AI Calls',
        description: error.message || 'Failed to start AI calls',
        variant: 'destructive',
      });
    },
  });

  const handleStartAiCalls = () => {
    if (confirm('Start AI calls for up to 10 contacts from the queue?')) {
      startAiCallsMutation.mutate({
        campaignId: campaign.id.toString(),
        limit: 10,
      });
    }
  };

  const completedPercent = queueStats?.total
    ? Math.round((queueStats.completed / queueStats.total) * 100)
    : 0;

  return (
    
      {/* Queue Statistics Grid */}
      
        
          In Queue
          
            {queueStats?.queued || 0}
          
        
        
          In Progress
          
            {queueStats?.inProgress || 0}
          
        
        
          Completed
          
            {queueStats?.completed || 0}
          
        
        
          Filtered Out
          
            {queueStats?.removed || 0}
          
        
         0
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/40'
              : 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800'
          }`}
          onClick={() => (queueStats?.invalid || 0) > 0 && setInvalidModalOpen(true)}
          title={(queueStats?.invalid || 0) > 0 ? 'Click to view invalid records' : 'No invalid records'}
        >
           0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            Invalid
          
           0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400 dark:text-gray-500'}`}>
            {queueStats?.invalid || 0}
          
        
      

      {/* Removed/Filtered Breakdown */}
      {queueStats?.removed > 0 && queueStats.removedBreakdown && Object.keys(queueStats.removedBreakdown).length > 0 && (
        
          
            
            
              Filtered Contacts Breakdown
            
          
          
            {Object.entries(queueStats.removedBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                
                  
                    {reason.replace(/_/g, ' ')}:
                  
                  
                    {count}
                  
                
              ))}
          
        
      )}

      {/* Progress Bar */}
      
        
          Queue Progress
          {completedPercent}%
        
        
      

      {/* Agents & Total Queue Info */}
      
        
          
          
            {queueStats?.agents || 0} Agent{queueStats?.agents !== 1 ? 's' : ''} Assigned
          
        
        
          
          {queueStats?.total || 0} Total in Queue Table
        
      

      {/* Suppression Statistics */}
      {queueStats?.suppression && queueStats.suppression.totalSuppressed > 0 && (
        
          
            
              
              
                Suppression Matches
              
            
            
              {queueStats.suppression.totalSuppressed} contacts (
              {Math.round(queueStats.suppression.suppressionRate * 100)}%)
            
          
          
            {queueStats.suppression.suppressedByAccount > 0 && (
              
                By Account:
                
                  {queueStats.suppression.suppressedByAccount}
                
              
            )}
            {queueStats.suppression.suppressedByContact > 0 && (
              
                By Contact:
                
                  {queueStats.suppression.suppressedByContact}
                
              
            )}
            {queueStats.suppression.suppressedByDomain > 0 && (
              
                By Domain:
                
                  {queueStats.suppression.suppressedByDomain}
                
              
            )}
            {queueStats.suppression.suppressedByEmail > 0 && (
              
                By Email:
                
                  {queueStats.suppression.suppressedByEmail}
                
              
            )}
          
        
      )}

      
        
          
            
              Dialer Controls
            
            
              {isAiAgent
                ? 'Use the queue as the control plane for AI dialing, agent capacity, and voice rotation.'
                : 'Manage queue flow, agent coverage, and reporting from a more compact action surface.'}
            
          
          
             setLocation(`/campaigns/${campaign.id}/queue`)}
            >
              
              View Queue
            

            {onToggleStatus && (
              
                {campaign.status === 'active' ? (
                  <>
                    
                    Pause
                  
                ) : (
                  <>
                    
                    Resume
                  
                )}
              
            )}

            {isAiAgent && campaign.status === 'active' && (
              
                {startAiCallsMutation.isPending ? (
                  
                ) : (
                  
                )}
                Start AI Calls
              
            )}

            
              
                
                  
                  More
                
              
              
                 setLocation(`/campaigns/${campaign.id}/queue?tab=intelligence`)}>
                  
                  Queue Analysis
                
                {onAssignAgents && (
                  
                    
                    Assign Agents
                  
                )}
                {isAiAgent && (
                   setLocation(`/campaigns/${campaign.id}/test`)}>
                    
                    Test AI Agent
                  
                )}
                
                  
                  Sync Queue
                
                 setScaleDialogOpen(true)}>
                  
                  Deployment Scale
                
                 setVoiceDialogOpen(true)}>
                  
                  Assign Voices {selectedVoices.length > 0 ? `(${selectedVoices.length})` : ''}
                
                 setLocation(`/reports?campaign=${campaign.id}`)}>
                  
                  Reports
                
              
            
          
        
      

      
        
          
            AI Workforce Deployment Scale
            
              Adjust the number of concurrent AI agents deployed for this campaign.
            
          
          
            
              
                Concurrent Agents
              
               setWorkerCount(parseInt(e.target.value) || 1)}
                className="col-span-3"
              />
            
            
              Note: Each agent can handle 1 active conversation at a time. Increasing this scales your outreach throughput.
            
          
          
             updateScaleMutation.mutate(workerCount)}
              disabled={updateScaleMutation.isPending}
            >
              {updateScaleMutation.isPending && }
              Deploy Agents
            
          
        
      

      {/* Voice Assignment Dialog */}
      
        
          
            Assign Voice Rotation
            
              Select multiple voices to be used in rotation for this campaign.
              If none are selected, the default voice configuration will be used.
            
          
          
            
              
                {voiceOptions.map((voice: any) => (
                  
                    
                       v.id === voice.id)}
                        onCheckedChange={() => toggleVoice(voice.id, voice.name)}
                      />
                      
                        
                          {voice.name}
                        
                        
                          {voice.description || voice.gender || 'AI Voice'}
                        
                      
                    
                    
                     playVoicePreview(voice)}
                      disabled={loadingVoiceId === voice.id}
                      title="Preview Voice"
                    >
                      {loadingVoiceId === voice.id ? (
                        
                      ) : playingVoiceId === voice.id ? (
                        
                      ) : (
                        
                      )}
                    
                  
                ))}
                {voiceOptions.length === 0 && (
                  
                    No voices available.
                  
                )}
              
            
          
          
             updateVoicesMutation.mutate(selectedVoices)}
              disabled={updateVoicesMutation.isPending}
            >
              {updateVoicesMutation.isPending ? "Saving..." : "Save Voices"}
            
          
        
      

      {/* Invalid Records Modal */}
      
    
  );
}