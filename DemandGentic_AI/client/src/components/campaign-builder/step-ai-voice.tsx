import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Mic, Volume2, Play, Square, User, Building2, Loader2, Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, apiRequest } from "@/lib/queryClient";

// Import voices from shared constants
import { ALL_VOICES, type VoiceOption } from '@/lib/voice-constants';

interface StepAIVoiceProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
}

// AI Voice type
type AiVoice = string;

// Use imported voices
const AI_VOICES = ALL_VOICES.map(v => ({
  value: v.id as AiVoice,
  label: v.name,
  description: v.description,
  gender: v.gender,
  provider: v.provider,
  tone: v.tone,
  bestFor: v.bestFor,
  color: v.color,
}));

export function StepAIVoice({ data, onNext, onBack }: StepAIVoiceProps) {
  const { toast } = useToast();
  const [selectedVoice, setSelectedVoice] = useState(data.aiAgentSettings?.persona?.voice || 'Fenrir');
  const [genderFilter, setGenderFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [playingVoice, setPlayingVoice] = useState(null);
  const [loadingVoice, setLoadingVoice] = useState(null);

  // AI Persona Configuration
  const [aiPersonaName, setAiPersonaName] = useState(data.aiAgentSettings?.persona?.name || '');
  const [aiRole, setAiRole] = useState(data.aiAgentSettings?.persona?.role || 'Sales Representative');

  // Fetch the organization name from the selected organizationId (set in Campaign Context step)
  const { data: organizationData } = useQuery({
    queryKey: ['campaign-organization', data.organizationId],
    queryFn: async () => {
      if (!data.organizationId) return null;
      try {
        const res = await apiRequest('GET', `/api/campaign-organizations/${data.organizationId}`);
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!data.organizationId,
  });

  // Company name comes from the selected organization
  const companyName = organizationData?.name || data.aiAgentSettings?.persona?.companyName || '';

  const filteredVoices = AI_VOICES.filter(voice => {
    if (genderFilter !== 'all' && voice.gender !== genderFilter) return false;
    if (providerFilter !== 'all' && voice.provider !== providerFilter) return false;
    return true;
  });

  // Audio reference for voice previews
  const audioRef = useRef(null);

  const handlePlayVoice = async (voiceId: string) => {
    if (playingVoice === voiceId) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingVoice(null);
      setLoadingVoice(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const voice = AI_VOICES.find(v => v.value === voiceId);
    if (!voice) return;

    setLoadingVoice(voiceId);

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
          voiceId: voiceId,
          provider: voice.provider, // 'gemini' or 'openai'
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
        setPlayingVoice(null);
        setLoadingVoice(null);
        URL.revokeObjectURL(audioUrl);
      };
      audioRef.current.onerror = (e) => {
        console.error('Audio playback error:', e);
        setPlayingVoice(null);
        setLoadingVoice(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Playback Error",
          description: "Could not play audio. Please try again.",
          variant: "destructive",
        });
      };
      setPlayingVoice(voiceId);
      setLoadingVoice(null);
      await audioRef.current.play();
    } catch (error) {
      console.error('Voice preview failed:', error);
      setPlayingVoice(null);
      setLoadingVoice(null);
      toast({
        title: "Preview Unavailable",
        description: error instanceof Error ? error.message : "Could not load voice preview. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = () => {
    const aiAgentSettings = {
      ...data.aiAgentSettings,
      persona: {
        ...data.aiAgentSettings?.persona,
        name: aiPersonaName,
        companyName: companyName, // Always use organization name
        role: aiRole,
        voice: selectedVoice,
      },
    };

    onNext({
      aiAgentSettings,
      dialMode: 'ai_agent',
    });
  };

  const selectedVoiceData = AI_VOICES.find(v => v.value === selectedVoice);

  return (
    
      {/* Header */}
      
        
          
            
            
              AI Voice Selection
              
                Choose the AI voice that will represent your brand on calls
              
            
          
        
      

      {/* AI Persona Configuration */}
      
        
          
            
            AI Persona
          
          
            Configure how your AI agent introduces itself
          
        
        
          
            
              Agent Name
               setAiPersonaName(e.target.value)}
              />
              Name used in introductions
            

            
              Company Name
              
                
                
                  {companyName || "Select organization in Campaign Context step"}
                
              
              From selected organization
            

            
              Agent Role
               setAiRole(e.target.value)}
              />
              Role/title for the agent
            
          
        
      

      {/* Voice Filters */}
      
        
          Gender
          
            {(['all', 'male', 'female'] as const).map((gender) => (
               setGenderFilter(gender)}
              >
                {gender === 'all' ? 'All' : gender.charAt(0).toUpperCase() + gender.slice(1)}
              
            ))}
          
        

        
          Provider
          
            {(['all', 'gemini', 'openai'] as const).map((provider) => (
               setProviderFilter(provider)}
              >
                {provider === 'all' ? 'All' : provider === 'gemini' ? 'Gemini' : 'OpenAI'}
              
            ))}
          
        
      

      {/* Voice Grid - Compact cards for better overview */}
      
        {filteredVoices.map((voice) => (
           setSelectedVoice(voice.value)}
          >
            
              
                
              
              
                {voice.label}
                
                  
                    {voice.gender === 'male' ? 'M' : 'F'}
                  
                  
                    {voice.provider === 'gemini' ? 'G' : 'O'}
                  
                
              
               {
                  e.stopPropagation();
                  handlePlayVoice(voice.value);
                }}
              >
                {loadingVoice === voice.value ? (
                  
                ) : playingVoice === voice.value ? (
                  
                ) : (
                  
                )}
              
            
            {voice.tone}
          
        ))}
      

      {/* Selected Voice Summary */}
      {selectedVoiceData && (
        
          
            
              
                
              
              
                Selected: {selectedVoiceData.label}
                {selectedVoiceData.tone}
              
            
          
        
      )}

      {/* Navigation */}
      
        
          Back
        
        
          Continue
        
      
    
  );
}