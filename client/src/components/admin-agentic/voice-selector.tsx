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
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search voices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <RadioGroup
          value={genderFilter}
          onValueChange={(v) => setGenderFilter(v as "all" | "male" | "female")}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="cursor-pointer">All</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="female" id="female" />
            <Label htmlFor="female" className="cursor-pointer">Female</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="male" id="male" />
            <Label htmlFor="male" className="cursor-pointer">Male</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Voice Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sortedVoices.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isRecommended = recommendedVoice === voice.id;
          const isPlaying = playingVoice === voice.id;
          const isLoading = loadingVoice === voice.id;

          return (
            <Card
              key={voice.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary",
                isRecommended && !isSelected && "border-green-500/50"
              )}
              onClick={() => onVoiceSelect(voice.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        voice.gender === "female"
                          ? "bg-pink-100 text-pink-600"
                          : "bg-blue-100 text-blue-600"
                      )}
                    >
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        {voice.name}
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {voice.tone}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {isRecommended && (
                      <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">
                        Recommended
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {voice.gender}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground mb-3">
                  Best for: {voice.bestFor}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPreview(voice);
                    }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Loading
                      </>
                    ) : isPlaying ? (
                      <>
                        <Pause className="h-3 w-3 mr-1" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Preview
                      </>
                    )}
                  </Button>
                  {isSelected ? (
                    <Button size="sm" className="flex-1" disabled>
                      <Check className="h-3 w-3 mr-1" />
                      Selected
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVoiceSelect(voice.id);
                      }}
                    >
                      <Mic className="h-3 w-3 mr-1" />
                      Select
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredVoices.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No voices found matching your criteria
        </div>
      )}
    </div>
  );
}

export default VoiceSelector;
