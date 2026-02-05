import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Play, Pause, Volume2, Check, Search, User, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female";
  tone: string;
  description: string;
  bestFor: string;
  sampleUrl?: string;
}

// Default Gemini voices with metadata
export const GEMINI_VOICES: VoiceOption[] = [
  { id: "Kore", name: "Kore", gender: "female", tone: "Warm, Professional", description: "Confident and approachable", bestFor: "Executive outreach" },
  { id: "Fenrir", name: "Fenrir", gender: "male", tone: "Bold, Confident", description: "Strong and persuasive", bestFor: "Enterprise sales" },
  { id: "Charon", name: "Charon", gender: "male", tone: "Deep, Authoritative", description: "Trustworthy and commanding", bestFor: "Technical decision makers" },
  { id: "Aoede", name: "Aoede", gender: "female", tone: "Friendly, Energetic", description: "Upbeat and engaging", bestFor: "Mid-market outreach" },
  { id: "Pegasus", name: "Pegasus", gender: "male", tone: "Clear, Professional", description: "Clear and articulate", bestFor: "General B2B" },
  { id: "Leda", name: "Leda", gender: "female", tone: "Consultative", description: "Thoughtful and advisory", bestFor: "High-value prospects" },
  { id: "Vega", name: "Vega", gender: "female", tone: "Modern, Dynamic", description: "Contemporary and energetic", bestFor: "Tech companies" },
  { id: "Zephyr", name: "Zephyr", gender: "male", tone: "Calm, Trustworthy", description: "Steady and reliable", bestFor: "Financial services" },
  { id: "Orus", name: "Orus", gender: "male", tone: "Warm, Empathetic", description: "Understanding and personable", bestFor: "Healthcare, Education" },
  { id: "Puck", name: "Puck", gender: "male", tone: "Bright, Enthusiastic", description: "Lively and engaging", bestFor: "Startups, SMB" },
  { id: "Altair", name: "Altair", gender: "male", tone: "Professional, Direct", description: "Efficient and clear", bestFor: "Executive communications" },
  { id: "Lyra", name: "Lyra", gender: "female", tone: "Sophisticated, Elegant", description: "Refined and polished", bestFor: "Luxury, Premium brands" },
  { id: "Clio", name: "Clio", gender: "female", tone: "Intellectual, Articulate", description: "Knowledgeable and clear", bestFor: "Research, Consulting" },
  { id: "Nova", name: "Nova", gender: "female", tone: "Fresh, Innovative", description: "Modern and forward-thinking", bestFor: "Innovation, Product launches" },
  { id: "Atlas", name: "Atlas", gender: "male", tone: "Powerful, Grounded", description: "Strong and dependable", bestFor: "Manufacturing, Industrial" },
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
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
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
      return;
    }

    // If we have a sample URL, play it
    if (voice.sampleUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(voice.sampleUrl);
      audioRef.current.onended = () => setPlayingVoice(null);
      await audioRef.current.play();
      setPlayingVoice(voice.id);
    } else {
      // Generate a preview using Web Speech API as fallback
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          `Hello, this is ${voice.name}. I'm a ${voice.tone.toLowerCase()} voice, perfect for ${voice.bestFor.toLowerCase()}.`
        );
        utterance.rate = 0.9;
        utterance.pitch = voice.gender === "female" ? 1.1 : 0.9;
        utterance.onend = () => setPlayingVoice(null);
        window.speechSynthesis.speak(utterance);
        setPlayingVoice(voice.id);
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPreview(voice);
                    }}
                  >
                    {isPlaying ? (
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
