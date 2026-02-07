/**
 * Voice Selection Dialog Component
 *
 * Beautiful dialog for selecting AI voices for campaigns.
 * Features rich voice profiles with gender, tone, and use case tags.
 */

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, Headphones, Play, Pause, Mic, Volume2, User, Users, Loader2, Sparkles, Check, ArrowRight } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getAuthHeaders } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Import voices from shared constants
import { GEMINI_VOICES as AI_VOICES } from '@/lib/voice-constants';

export interface VoiceSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: {
    id: string | number;
    name: string;
    voiceId?: string;
  } | null;
  onSuccess?: () => void;
}

export function VoiceSelectionDialog({
  open,
  onOpenChange,
  campaign,
  onSuccess,
}: VoiceSelectionDialogProps) {
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(campaign?.voiceId || 'Fenrir');
  const [voiceFilter, setVoiceFilter] = useState<'all' | 'male' | 'female'>('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update selected voice when campaign changes
  useState(() => {
    if (campaign?.voiceId) {
      setSelectedVoiceId(campaign.voiceId);
    }
  });

  // Audio reference for playing previews
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Loading state for voice preview
  const [loadingVoiceId, setLoadingVoiceId] = React.useState<string | null>(null);

  // Voice preview function - uses real Google TTS voices via API
  const playVoicePreview = async (voice: typeof AI_VOICES[0]) => {
    if (playingVoiceId === voice.id) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setLoadingVoiceId(voice.id);

    // Use the voice provider API to generate a real preview with unique voice
    try {
      const response = await fetch('/api/voice-providers/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({
          voiceId: voice.id,
          provider: voice.provider || 'gemini', // Use voice provider or default to gemini
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      if (audioBlob.size === 0) {
        throw new Error('No audio data received');
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => {
        setPlayingVoiceId(null);
        setLoadingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
      };
      audioRef.current.onerror = (e) => {
        console.error('Audio playback error:', e);
        setPlayingVoiceId(null);
        setLoadingVoiceId(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Playback Error",
          description: "Could not play audio. Please try again.",
          variant: "destructive",
        });
      };
      setPlayingVoiceId(voice.id);
      setLoadingVoiceId(null);
      await audioRef.current.play();
    } catch (error) {
      console.error('Voice preview failed:', error);
      setPlayingVoiceId(null);
      setLoadingVoiceId(null);
      toast({
        title: "Preview Unavailable",
        description: error instanceof Error ? error.message : "Could not load voice preview. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Save voice selection mutation
  const saveVoiceMutation = useMutation({
    mutationFn: async ({ campaignId, voiceId }: { campaignId: string; voiceId: string }) => {
      return await apiRequest('PATCH', `/api/campaigns/${campaignId}`, { voiceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      toast({
        title: 'Voice Updated',
        description: 'AI voice has been assigned to the campaign.',
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update voice',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!campaign) return;
    saveVoiceMutation.mutate({
      campaignId: campaign.id.toString(),
      voiceId: selectedVoiceId,
    });
  };

  const filteredVoices = AI_VOICES.filter(v => voiceFilter === 'all' || v.gender === voiceFilter);
  const selectedVoice = AI_VOICES.find(v => v.id === selectedVoiceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] max-h-[850px] p-0 overflow-hidden flex flex-col bg-gradient-to-br from-slate-50 to-white">
        {/* Enhanced Header */}
        <DialogHeader className="px-8 py-6 border-b bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl shadow-lg">
              <Mic className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold text-white tracking-tight">Select AI Voice</DialogTitle>
              <DialogDescription className="text-violet-100 text-base mt-1">
                Choose the perfect voice for{' '}
                <span className="font-semibold text-white">{campaign?.name || 'your campaign'}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col px-8 py-6">
          {/* Filter Section */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500 mr-2">Filter by:</span>
              <button
                onClick={() => setVoiceFilter('all')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'all'
                    ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50"
                )}
              >
                <Users className="h-4 w-4" />
                All Voices ({AI_VOICES.length})
              </button>
              <button
                onClick={() => setVoiceFilter('male')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'male'
                    ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                )}
              >
                <User className="h-4 w-4" />
                Male ({AI_VOICES.filter(v => v.gender === 'male').length})
              </button>
              <button
                onClick={() => setVoiceFilter('female')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'female'
                    ? "bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-lg shadow-rose-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50"
                )}
              >
                <User className="h-4 w-4" />
                Female ({AI_VOICES.filter(v => v.gender === 'female').length})
              </button>
            </div>

            {/* Selected Voice Preview */}
            {selectedVoice && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl border-2 border-violet-300 bg-violet-50">
                <Check className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-slate-700">
                  Selected: <span className="font-bold">{selectedVoice.name}</span>
                </span>
              </div>
            )}
          </div>

          {/* Voice Grid */}
          <ScrollArea className="flex-1 pr-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4">
              {filteredVoices.map((voice) => (
                <Card
                  key={voice.id}
                  className={cn(
                    "cursor-pointer transition-all duration-300 hover:shadow-xl relative overflow-hidden group border-2",
                    selectedVoiceId === voice.id
                      ? "ring-2 ring-offset-2 ring-violet-500 shadow-lg border-violet-400"
                      : "border-slate-200 hover:border-violet-300"
                  )}
                  onClick={() => setSelectedVoiceId(voice.id)}
                >
                  {/* Gradient Header Bar */}
                  <div className={`h-2 bg-gradient-to-r ${voice.color}`} />

                  {/* Selection Indicator */}
                  {selectedVoiceId === voice.id && (
                    <div className="absolute top-5 right-3 z-10">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${voice.color} flex items-center justify-center shadow-lg`}>
                        <CheckCircle className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  )}

                  <CardContent className="p-5">
                    {/* Voice Avatar & Name */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg ${voice.color} group-hover:scale-110 transition-transform duration-300`}>
                        <Headphones className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xl text-slate-800">{voice.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs capitalize font-medium",
                              voice.gender === 'male' ? "border-blue-300 text-blue-600 bg-blue-50" : "border-rose-300 text-rose-600 bg-rose-50"
                            )}
                          >
                            {voice.gender}
                          </Badge>
                          <span className="text-xs text-slate-400">{voice.provider}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tone Badge */}
                    <div className="mb-3">
                      <Badge className={`bg-gradient-to-r text-white border-0 text-xs px-3 py-1 ${voice.color}`}>
                        <Sparkles className="h-3 w-3 mr-1" />
                        {voice.tone}
                      </Badge>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed">
                      {voice.description}
                    </p>

                    {/* Best For Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {voice.bestFor.map((tag, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-xs font-normal bg-slate-100"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Preview Button */}
                    <Button
                      variant={playingVoiceId === voice.id ? 'default' : 'outline'}
                      size="lg"
                      disabled={loadingVoiceId === voice.id}
                      className={cn(
                        "w-full h-11 rounded-xl font-medium transition-all duration-200",
                        playingVoiceId === voice.id
                          ? `bg-gradient-to-r ${voice.color} border-0 text-white shadow-lg`
                          : "border-2 hover:bg-slate-50"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoicePreview(voice);
                      }}
                    >
                      {loadingVoiceId === voice.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : playingVoiceId === voice.id ? (
                        <>
                          <Pause className="h-4 w-4 mr-2" />
                          Stop Preview
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Preview Voice
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Enhanced Footer */}
        <div className="px-8 py-5 border-t bg-slate-50/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between">
            {/* Selected Voice Info */}
            <div className="flex items-center gap-4">
              {selectedVoice && (
                <>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${selectedVoice.color} shadow-md`}>
                    <Volume2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Selected Voice</p>
                    <p className="font-bold text-lg text-slate-800">{selectedVoice.name}</p>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => onOpenChange(false)}
                className="h-12 px-6 text-base border-2 rounded-xl hover:bg-slate-100 transition-all"
              >
                Cancel
              </Button>
              <Button
                size="lg"
                onClick={handleSave}
                disabled={saveVoiceMutation.isPending}
                className="h-12 px-8 text-base font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-200/50 transition-all duration-300"
              >
                {saveVoiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Save Voice Selection
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
