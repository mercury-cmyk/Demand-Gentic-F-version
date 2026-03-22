import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Play, Pause, Volume2, Check, Search, User, Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  tone: string;
  description: string;
  bestFor: string;
  sampleUrl?: string;
}

// Official Gemini TTS voices (from Google's documentation)
// These are the REAL voices supported by the live voice API
export const GEMINI_VOICES: VoiceOption[] = [
  // Top recommended for B2B sales
  { id: "Kore", name: "Kore", gender: "female", tone: "Firm, Professional", description: "Confident and direct", bestFor: "Executive outreach" },
  { id: "Fenrir", name: "Fenrir", gender: "male", tone: "Excitable, Energetic", description: "Enthusiastic and persuasive", bestFor: "Enterprise sales" },
  { id: "Charon", name: "Charon", gender: "male", tone: "Informative, Authoritative", description: "Trustworthy and knowledgeable", bestFor: "Technical decision makers" },
  { id: "Aoede", name: "Aoede", gender: "female", tone: "Breezy, Friendly", description: "Light and approachable", bestFor: "Mid-market outreach" },
  { id: "Puck", name: "Puck", gender: "male", tone: "Upbeat, Lively", description: "Energetic and engaging", bestFor: "Startups, SMB" },
  { id: "Leda", name: "Leda", gender: "female", tone: "Youthful, Fresh", description: "Modern and relatable", bestFor: "Tech companies" },
  { id: "Zephyr", name: "Zephyr", gender: "male", tone: "Bright, Clear", description: "Articulate and professional", bestFor: "Financial services" },
  { id: "Orus", name: "Orus", gender: "male", tone: "Firm, Steady", description: "Reliable and trustworthy", bestFor: "Healthcare, Education" },
  
  // Additional professional voices
  { id: "Sulafat", name: "Sulafat", gender: "female", tone: "Warm, Caring", description: "Empathetic and personable", bestFor: "Customer success" },
  { id: "Gacrux", name: "Gacrux", gender: "male", tone: "Mature, Experienced", description: "Seasoned and credible", bestFor: "C-suite conversations" },
  { id: "Achird", name: "Achird", gender: "female", tone: "Friendly, Approachable", description: "Welcoming and warm", bestFor: "First contact calls" },
  { id: "Schedar", name: "Schedar", gender: "male", tone: "Even, Balanced", description: "Calm and composed", bestFor: "Complex negotiations" },
  { id: "Sadaltager", name: "Sadaltager", gender: "male", tone: "Knowledgeable, Expert", description: "Authoritative consultant", bestFor: "Advisory calls" },
  { id: "Pulcherrima", name: "Pulcherrima", gender: "female", tone: "Forward, Confident", description: "Bold and assertive", bestFor: "Closing calls" },
  
  // Specialized voices
  { id: "Iapetus", name: "Iapetus", gender: "male", tone: "Clear, Precise", description: "Technical and accurate", bestFor: "Product demos" },
  { id: "Erinome", name: "Erinome", gender: "female", tone: "Clear, Articulate", description: "Professional presenter", bestFor: "Presentations" },
  { id: "Vindemiatrix", name: "Vindemiatrix", gender: "female", tone: "Gentle, Soft", description: "Calming presence", bestFor: "Sensitive topics" },
  { id: "Achernar", name: "Achernar", gender: "female", tone: "Soft, Reassuring", description: "Comforting and kind", bestFor: "Support calls" },
  
  // Dynamic voices
  { id: "Sadachbia", name: "Sadachbia", gender: "female", tone: "Lively, Dynamic", description: "High-energy and exciting", bestFor: "Product launches" },
  { id: "Laomedeia", name: "Laomedeia", gender: "female", tone: "Upbeat, Positive", description: "Optimistic and motivating", bestFor: "Follow-up calls" },
  
  // Character voices  
  { id: "Enceladus", name: "Enceladus", gender: "male", tone: "Breathy, Intimate", description: "Thoughtful whisper", bestFor: "Confidential discussions" },
  { id: "Algenib", name: "Algenib", gender: "male", tone: "Gravelly, Deep", description: "Distinctive and memorable", bestFor: "Brand differentiation" },
  { id: "Rasalgethi", name: "Rasalgethi", gender: "male", tone: "Informative, Educational", description: "Teacher-like clarity", bestFor: "Training calls" },
  { id: "Alnilam", name: "Alnilam", gender: "male", tone: "Firm, Decisive", description: "Strong and commanding", bestFor: "Leadership messaging" },
];

interface VoiceSelectorProps {
  selectedVoice: string | null;
  onVoiceSelect: (voiceId: string) => void;
  recommendedVoice?: string;
  voices?: VoiceOption[];
  className?: string;
}

export function VoiceSelector({
  selectedVoice,
  onVoiceSelect,
  recommendedVoice,
  voices = GEMINI_VOICES,
  className,
}: VoiceSelectorProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [playingVoice, setPlayingVoice] = useState(null);
  const [loadingVoice, setLoadingVoice] = useState(null);
  const audioRef = useRef(null);

  const filteredVoices = voices.filter((voice) => {
    const matchesSearch =
      voice.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voice.tone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      voice.bestFor.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGender = genderFilter === "all" || voice.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const handlePlayPreview = async (voice: VoiceOption) => {
    if (playingVoice === voice.id) {
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

    setLoadingVoice(voice.id);

    // If we have a sample URL, play it
    if (voice.sampleUrl) {
      audioRef.current = new Audio(voice.sampleUrl);
      audioRef.current.onended = () => {
        setPlayingVoice(null);
        setLoadingVoice(null);
      };
      audioRef.current.onerror = () => {
        setPlayingVoice(null);
        setLoadingVoice(null);
      };
      setPlayingVoice(voice.id);
      setLoadingVoice(null);
      await audioRef.current.play();
    } else {
      // Use the voice provider API to generate a real preview
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
            provider: 'gemini', // Gemini voices
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
        setPlayingVoice(voice.id);
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
    }
  };

  const sortedVoices = [...filteredVoices].sort((a, b) => {
    // Put recommended voice first
    if (recommendedVoice) {
      if (a.id === recommendedVoice) return -1;
      if (b.id === recommendedVoice) return 1;
    }
    // Then selected voice
    if (a.id === selectedVoice) return -1;
    if (b.id === selectedVoice) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    
      {/* Filters */}
      
        
          
           setSearchTerm(e.target.value)}
            className="pl-9"
          />
        
         setGenderFilter(v as "all" | "male" | "female")}
          className="flex gap-4"
        >
          
            
            All
          
          
            
            Female
          
          
            
            Male
          
        
      

      {/* Voice Grid */}
      
        {sortedVoices.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isRecommended = recommendedVoice === voice.id;
          const isPlaying = playingVoice === voice.id;
          const isLoading = loadingVoice === voice.id;

          return (
             onVoiceSelect(voice.id)}
            >
              
                
                  
                    
                      
                    
                    
                      
                        {voice.name}
                        {isSelected && (
                          
                        )}
                      
                      
                        {voice.tone}
                      
                    
                  
                  
                    {isRecommended && (
                      
                        Recommended
                      
                    )}
                    
                      {voice.gender}
                    
                  
                
              
              
                
                  Best for: {voice.bestFor}
                
                
                   {
                      e.stopPropagation();
                      handlePlayPreview(voice);
                    }}
                  >
                    {isLoading ? (
                      <>
                        
                        Loading
                      
                    ) : isPlaying ? (
                      <>
                        
                        Stop
                      
                    ) : (
                      <>
                        
                        Preview
                      
                    )}
                  
                  {isSelected ? (
                    
                      
                      Selected
                    
                  ) : (
                     {
                        e.stopPropagation();
                        onVoiceSelect(voice.id);
                      }}
                    >
                      
                      Select
                    
                  )}
                
              
            
          );
        })}
      

      {filteredVoices.length === 0 && (
        
          No voices found matching your criteria
        
      )}
    
  );
}

export default VoiceSelector;