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
  const [selectedVoice, setSelectedVoice] = useState<AiVoice>(data.aiAgentSettings?.persona?.voice || 'Fenrir');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [providerFilter, setProviderFilter] = useState<'all' | 'gemini' | 'openai'>('all');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);

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
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Mic className="w-6 h-6 text-primary" />
            <div>
              <CardTitle className="text-lg">AI Voice Selection</CardTitle>
              <CardDescription className="mt-1">
                Choose the AI voice that will represent your brand on calls
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* AI Persona Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5" />
            <CardTitle className="text-base">AI Persona</CardTitle>
          </div>
          <CardDescription>
            Configure how your AI agent introduces itself
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ai-persona-name">Agent Name</Label>
              <Input
                id="ai-persona-name"
                placeholder="e.g., Sarah, Michael"
                value={aiPersonaName}
                onChange={(e) => setAiPersonaName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Name used in introductions</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-company-name">Company Name</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50">
                <Building className="w-4 h-4 text-muted-foreground" />
                <span className={companyName ? "text-foreground" : "text-muted-foreground"}>
                  {companyName || "Select organization in Campaign Context step"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">From selected organization</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-role">Agent Role</Label>
              <Input
                id="ai-role"
                placeholder="e.g., Sales Representative"
                value={aiRole}
                onChange={(e) => setAiRole(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Role/title for the agent</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Voice Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label className="text-sm">Gender</Label>
          <div className="flex gap-2">
            {(['all', 'male', 'female'] as const).map((gender) => (
              <Button
                key={gender}
                variant={genderFilter === gender ? "default" : "outline"}
                size="sm"
                onClick={() => setGenderFilter(gender)}
              >
                {gender === 'all' ? 'All' : gender.charAt(0).toUpperCase() + gender.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Provider</Label>
          <div className="flex gap-2">
            {(['all', 'gemini', 'openai'] as const).map((provider) => (
              <Button
                key={provider}
                variant={providerFilter === provider ? "default" : "outline"}
                size="sm"
                onClick={() => setProviderFilter(provider)}
              >
                {provider === 'all' ? 'All' : provider === 'gemini' ? 'Gemini' : 'OpenAI'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Grid - Compact cards for better overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {filteredVoices.map((voice) => (
          <div
            key={voice.value}
            className={cn(
              "cursor-pointer transition-all rounded-lg border p-2 hover:shadow-sm",
              selectedVoice === voice.value
                ? "ring-2 ring-primary border-primary bg-primary/5"
                : "hover:border-primary/50"
            )}
            onClick={() => setSelectedVoice(voice.value)}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br flex-shrink-0",
                voice.color
              )}>
                <Mic className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{voice.label}</div>
                <div className="flex gap-1">
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    {voice.gender === 'male' ? 'M' : 'F'}
                  </Badge>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                    {voice.provider === 'gemini' ? 'G' : 'O'}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                disabled={loadingVoice === voice.value}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayVoice(voice.value);
                }}
              >
                {loadingVoice === voice.value ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : playingVoice === voice.value ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{voice.tone}</p>
          </div>
        ))}
      </div>

      {/* Selected Voice Summary */}
      {selectedVoiceData && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br",
                selectedVoiceData.color
              )}>
                <Volume2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-medium">Selected: {selectedVoiceData.label}</p>
                <p className="text-sm text-muted-foreground">{selectedVoiceData.tone}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit}>
          Continue
        </Button>
      </div>
    </div>
  );
}
