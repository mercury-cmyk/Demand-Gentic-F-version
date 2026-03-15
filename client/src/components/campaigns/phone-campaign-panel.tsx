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
  removedBreakdown: Record<string, number>;
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
  const [selectedVoices, setSelectedVoices] = useState<{ id: string; name: string }[]>(
    campaign.assignedVoices || []
  );

  // Audio preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    <div className={className}>
      {/* Queue Statistics Grid */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">In Queue</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {queueStats?.queued || 0}
          </p>
        </div>
        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">In Progress</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {queueStats?.inProgress || 0}
          </p>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">Completed</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {queueStats?.completed || 0}
          </p>
        </div>
        <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Filtered Out</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
            {queueStats?.removed || 0}
          </p>
        </div>
        <div
          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
            (queueStats?.invalid || 0) > 0
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/40'
              : 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800'
          }`}
          onClick={() => (queueStats?.invalid || 0) > 0 && setInvalidModalOpen(true)}
          title={(queueStats?.invalid || 0) > 0 ? 'Click to view invalid records' : 'No invalid records'}
        >
          <p className={`text-xs font-medium ${(queueStats?.invalid || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            Invalid
          </p>
          <p className={`text-2xl font-bold ${(queueStats?.invalid || 0) > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400 dark:text-gray-500'}`}>
            {queueStats?.invalid || 0}
          </p>
        </div>
      </div>

      {/* Removed/Filtered Breakdown */}
      {queueStats?.removed > 0 && queueStats.removedBreakdown && Object.keys(queueStats.removedBreakdown).length > 0 && (
        <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">
              Filtered Contacts Breakdown
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(queueStats.removedBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between">
                  <span className="text-orange-600/80 dark:text-orange-400/80 capitalize">
                    {reason.replace(/_/g, ' ')}:
                  </span>
                  <span className="font-medium text-orange-700 dark:text-orange-300">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Queue Progress</span>
          <span className="font-medium">{completedPercent}%</span>
        </div>
        <Progress value={completedPercent} className="h-2" />
      </div>

      {/* Agents & Total Queue Info */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {queueStats?.agents || 0} Agent{queueStats?.agents !== 1 ? 's' : ''} Assigned
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{queueStats?.total || 0} Total in Queue Table</span>
        </div>
      </div>

      {/* Suppression Statistics */}
      {queueStats?.suppression && queueStats.suppression.totalSuppressed > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                Suppression Matches
              </span>
            </div>
            <Badge variant="destructive" className="text-xs">
              {queueStats.suppression.totalSuppressed} contacts (
              {Math.round(queueStats.suppression.suppressionRate * 100)}%)
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {queueStats.suppression.suppressedByAccount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Account:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByAccount}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByContact > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Contact:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByContact}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByDomain > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Domain:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByDomain}
                </span>
              </div>
            )}
            {queueStats.suppression.suppressedByEmail > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-red-600/80 dark:text-red-400/80">By Email:</span>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {queueStats.suppression.suppressedByEmail}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Dialer Controls
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAiAgent
                ? 'Use the queue as the control plane for AI dialing, agent capacity, and voice rotation.'
                : 'Manage queue flow, agent coverage, and reporting from a more compact action surface.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setLocation(`/campaigns/${campaign.id}/queue`)}
            >
              <Users className="h-4 w-4" />
              View Queue
            </Button>

            {onToggleStatus && (
              <Button size="sm" variant="outline" className="gap-2" onClick={onToggleStatus} disabled={isToggling}>
                {campaign.status === 'active' ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Resume
                  </>
                )}
              </Button>
            )}

            {isAiAgent && campaign.status === 'active' && (
              <Button
                size="sm"
                className="gap-2"
                onClick={handleStartAiCalls}
                disabled={startAiCallsMutation.isPending}
              >
                {startAiCallsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOutgoing className="h-4 w-4" />
                )}
                Start AI Calls
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocation(`/campaigns/${campaign.id}/queue?tab=intelligence`)}>
                  <Brain className="mr-2 h-4 w-4" />
                  Queue Analysis
                </DropdownMenuItem>
                {onAssignAgents && (
                  <DropdownMenuItem onClick={onAssignAgents}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Assign Agents
                  </DropdownMenuItem>
                )}
                {isAiAgent && (
                  <DropdownMenuItem onClick={() => setLocation(`/campaigns/${campaign.id}/test`)}>
                    <Bot className="mr-2 h-4 w-4" />
                    Test AI Agent
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleSyncQueue} disabled={syncQueueMutation.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Queue
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setScaleDialogOpen(true)}>
                  <Zap className="mr-2 h-4 w-4" />
                  Deployment Scale
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setVoiceDialogOpen(true)}>
                  <Mic className="mr-2 h-4 w-4" />
                  Assign Voices {selectedVoices.length > 0 ? `(${selectedVoices.length})` : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation(`/reports?campaign=${campaign.id}`)}>
                  <BarChart className="mr-2 h-4 w-4" />
                  Reports
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Dialog open={scaleDialogOpen} onOpenChange={setScaleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Workforce Deployment Scale</DialogTitle>
            <DialogDescription>
              Adjust the number of concurrent AI agents deployed for this campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
              <Label htmlFor="workers" className="text-right">
                Concurrent Agents
              </Label>
              <Input
                id="workers"
                type="number"
                min={1}
                max={50}
                value={workerCount}
                onChange={(e) => setWorkerCount(parseInt(e.target.value) || 1)}
                className="col-span-3"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Note: Each agent can handle 1 active conversation at a time. Increasing this scales your outreach throughput.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              onClick={() => updateScaleMutation.mutate(workerCount)}
              disabled={updateScaleMutation.isPending}
            >
              {updateScaleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deploy Agents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voice Assignment Dialog */}
      <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Assign Voice Rotation</DialogTitle>
            <DialogDescription>
              Select multiple voices to be used in rotation for this campaign.
              If none are selected, the default voice configuration will be used.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <ScrollArea className="h-[300px] w-full rounded-md border p-4">
              <div className="space-y-4">
                {voiceOptions.map((voice: any) => (
                  <div key={voice.id} className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-2 flex-1">
                      <Checkbox 
                        id={voice.id} 
                        checked={selectedVoices.some(v => v.id === voice.id)}
                        onCheckedChange={() => toggleVoice(voice.id, voice.name)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor={voice.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {voice.name}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {voice.description || voice.gender || 'AI Voice'}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => playVoicePreview(voice)}
                      disabled={loadingVoiceId === voice.id}
                      title="Preview Voice"
                    >
                      {loadingVoiceId === voice.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : playingVoiceId === voice.id ? (
                        <Pause className="h-4 w-4 text-primary" />
                      ) : (
                        <Play className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      )}
                    </Button>
                  </div>
                ))}
                {voiceOptions.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No voices available.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              onClick={() => updateVoicesMutation.mutate(selectedVoices)}
              disabled={updateVoicesMutation.isPending}
            >
              {updateVoicesMutation.isPending ? "Saving..." : "Save Voices"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invalid Records Modal */}
      <InvalidRecordsModal
        campaignId={campaign.id.toString()}
        open={invalidModalOpen}
        onOpenChange={setInvalidModalOpen}
      />
    </div>
  );
}
