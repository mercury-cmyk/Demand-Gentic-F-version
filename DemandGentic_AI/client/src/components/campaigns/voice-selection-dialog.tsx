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
  const [selectedVoiceId, setSelectedVoiceId] = useState(campaign?.voiceId || 'Fenrir');
  const [voiceFilter, setVoiceFilter] = useState('all');
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Update selected voice when campaign changes
  useState(() => {
    if (campaign?.voiceId) {
      setSelectedVoiceId(campaign.voiceId);
    }
  });

  // Audio reference for playing previews
  const audioRef = React.useRef(null);

  // Loading state for voice preview
  const [loadingVoiceId, setLoadingVoiceId] = React.useState(null);

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
    
      
        {/* Enhanced Header */}
        
          
          
            
              
            
            
              Select AI Voice
              
                Choose the perfect voice for{' '}
                {campaign?.name || 'your campaign'}
              
            
          
        

        {/* Main Content */}
        
          {/* Filter Section */}
          
            
              Filter by:
               setVoiceFilter('all')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'all'
                    ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50"
                )}
              >
                
                All Voices ({AI_VOICES.length})
              
               setVoiceFilter('male')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'male'
                    ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                )}
              >
                
                Male ({AI_VOICES.filter(v => v.gender === 'male').length})
              
               setVoiceFilter('female')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  voiceFilter === 'female'
                    ? "bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-lg shadow-rose-200"
                    : "bg-white border-2 border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50"
                )}
              >
                
                Female ({AI_VOICES.filter(v => v.gender === 'female').length})
              
            

            {/* Selected Voice Preview */}
            {selectedVoice && (
              
                
                
                  Selected: {selectedVoice.name}
                
              
            )}
          

          {/* Voice Grid */}
          
            
              {filteredVoices.map((voice) => (
                 setSelectedVoiceId(voice.id)}
                >
                  {/* Gradient Header Bar */}
                  

                  {/* Selection Indicator */}
                  {selectedVoiceId === voice.id && (
                    
                      
                        
                      
                    
                  )}

                  
                    {/* Voice Avatar & Name */}
                    
                      
                        
                      
                      
                        {voice.name}
                        
                          
                            {voice.gender}
                          
                          {voice.provider}
                        
                      
                    

                    {/* Tone Badge */}
                    
                      
                        
                        {voice.tone}
                      
                    

                    {/* Description */}
                    
                      {voice.description}
                    

                    {/* Best For Tags */}
                    
                      {voice.bestFor.map((tag, i) => (
                        
                          {tag}
                        
                      ))}
                    

                    {/* Preview Button */}
                     {
                        e.stopPropagation();
                        playVoicePreview(voice);
                      }}
                    >
                      {loadingVoiceId === voice.id ? (
                        <>
                          
                          Loading...
                        
                      ) : playingVoiceId === voice.id ? (
                        <>
                          
                          Stop Preview
                        
                      ) : (
                        <>
                          
                          Preview Voice
                        
                      )}
                    
                  
                
              ))}
            
          
        

        {/* Enhanced Footer */}
        
          
            {/* Selected Voice Info */}
            
              {selectedVoice && (
                <>
                  
                    
                  
                  
                    Selected Voice
                    {selectedVoice.name}
                  
                
              )}
            

            {/* Action Buttons */}
            
               onOpenChange(false)}
                className="h-12 px-6 text-base border-2 rounded-xl hover:bg-slate-100 transition-all"
              >
                Cancel
              
              
                {saveVoiceMutation.isPending ? (
                  <>
                    
                    Saving...
                  
                ) : (
                  <>
                    
                    Save Voice Selection
                    
                  
                )}
              
            
          
        
      
    
  );
}