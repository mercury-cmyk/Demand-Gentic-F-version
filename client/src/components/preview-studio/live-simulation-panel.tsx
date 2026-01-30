import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneOutgoing,
  Volume2,
  VolumeX,
  AlertTriangle,
  CheckCircle2,
  User,
  Bot,
  Loader2,
  Radio,
  Clock,
  BarChart3,
  FileText,
  Info,
  ChevronDown,
  Settings,
  Edit3,
  RotateCcw,
  Wand2,
  MessageSquare,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { EvaluationReport } from "@/types/call-analysis";
import {
  generateEvaluationReport,
  convertTranscriptsToMessages,
  buildSessionMemoryFromTranscripts,
} from "@/lib/call-analysis";

// Voice types for API response
interface VoiceInfo {
  id: string;
  name: string;
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  provider: 'openai' | 'gemini';
  description?: string;
}

interface VoicesByProvider {
  openai: VoiceInfo[];
  gemini: VoiceInfo[];
}

// Fallback voices (used if API fails)
const FALLBACK_OPENAI_VOICES: VoiceInfo[] = [
  { id: 'marin', name: 'marin', displayName: 'Marin', gender: 'female', language: 'en', provider: 'openai', description: 'Natural & conversational (Recommended)' },
  { id: 'alloy', name: 'alloy', displayName: 'Alloy', gender: 'neutral', language: 'en', provider: 'openai', description: 'Balanced & neutral' },
  { id: 'ash', name: 'ash', displayName: 'Ash', gender: 'male', language: 'en', provider: 'openai', description: 'Clear & professional' },
  { id: 'coral', name: 'coral', displayName: 'Coral', gender: 'female', language: 'en', provider: 'openai', description: 'Warm & friendly' },
  { id: 'verse', name: 'verse', displayName: 'Verse', gender: 'male', language: 'en', provider: 'openai', description: 'Expressive & dynamic' },
];

const FALLBACK_GEMINI_VOICES: VoiceInfo[] = [
  { id: 'Puck', name: 'Puck', displayName: 'Puck', gender: 'male', language: 'en', provider: 'gemini', description: 'Natural & Soft (Recommended)' },
  { id: 'Charon', name: 'Charon', displayName: 'Charon', gender: 'male', language: 'en', provider: 'gemini', description: 'Deep & Resonant' },
  { id: 'Kore', name: 'Kore', displayName: 'Kore', gender: 'female', language: 'en', provider: 'gemini', description: 'Balanced & Clear' },
  { id: 'Fenrir', name: 'Fenrir', displayName: 'Fenrir', gender: 'male', language: 'en', provider: 'gemini', description: 'Authoritative & Deep' },
  { id: 'Aoede', name: 'Aoede', displayName: 'Aoede', gender: 'female', language: 'en', provider: 'gemini', description: 'Bright & Expressive' },
];

// Turn detection options for OpenAI Realtime
const TURN_DETECTION_OPTIONS = [
  { value: 'server_vad', label: 'Server VAD - Automatic (Recommended)' },
  { value: 'semantic', label: 'Semantic - Context-aware detection' },
  { value: 'disabled', label: 'Disabled - Manual control only' },
];

// Eagerness levels for turn detection
const EAGERNESS_OPTIONS = [
  { value: 'low', label: 'Low - More patient, waits longer' },
  { value: 'medium', label: 'Medium - Balanced (Recommended)' },
  { value: 'high', label: 'High - More responsive, quicker turns' },
];

interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface PhoneTestSession {
  sessionId: string;
  testCallId: string;
  callControlId: string;
  phoneNumber: string;
  campaignName: string | null;
  agentName: string | null;
  voiceProvider: string;
}

interface LiveSimulationPanelProps {
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
  onAnalysisReady?: (report: EvaluationReport) => void;
}

type SimulationMode = 'voice' | 'phone';
type CallStatus = 'idle' | 'initiating' | 'ringing' | 'in_progress' | 'completed' | 'failed';
type TextSimStatus = 'idle' | 'running' | 'completed' | 'error';
type VoiceSimStatus = 'idle' | 'connecting' | 'active' | 'completed' | 'error';

interface BrowserSimulationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').slice(0, 200);
    const hint = preview.startsWith('<!DOCTYPE')
      ? 'Received HTML instead of JSON. Check auth/session or API server routing.'
      : `Unexpected response: ${preview || response.statusText}`;
    throw new Error(`${context} returned non-JSON. ${hint}`);
  }
  return response.json() as Promise<T>;
}

async function parseErrorMessage(response: Response, context: string): Promise<Error> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const message = data?.message || data?.error || response.statusText;
    return new Error(message || `${context} failed`);
  }
  const text = await response.text();
  const preview = text.replace(/\s+/g, ' ').slice(0, 200);
  const hint = preview.startsWith('<!DOCTYPE')
    ? 'Received HTML instead of JSON. Check auth/session or API server routing.'
    : preview || response.statusText;
  return new Error(`${context} failed. ${hint}`);
}

export function LiveSimulationPanel({
  campaignId,
  accountId,
  contactId,
  onAnalysisReady,
}: LiveSimulationPanelProps) {
  const [mode, setMode] = useState<SimulationMode>('voice');
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [phoneNumber, setPhoneNumber] = useState("");
  const [voiceProvider, setVoiceProvider] = useState<"openai" | "google">("google");
  const [selectedVoice, setSelectedVoice] = useState<string>("Kore");
  // OpenAI Realtime configuration
  const [turnDetection, setTurnDetection] = useState<string>("server_vad");
  const [eagerness, setEagerness] = useState<string>("medium");
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState<boolean>(false);
  // Prompt editing
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string>("");
  const [customFirstMessage, setCustomFirstMessage] = useState<string>("");
  const [isLoadingPrompt, setIsLoadingPrompt] = useState<boolean>(false);
  const [promptLoaded, setPromptLoaded] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<PhoneTestSession | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [browserMessages, setBrowserMessages] = useState<BrowserSimulationMessage[]>([]);
  const [browserInputValue, setBrowserInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  // Text simulation state
  const [textSimStatus, setTextSimStatus] = useState<TextSimStatus>('idle');
  const [selectedPersona, setSelectedPersona] = useState<string>('neutral_dm');
  const [textSimResult, setTextSimResult] = useState<any>(null);
  // Voice simulation state
  const [voiceSimStatus, setVoiceSimStatus] = useState<VoiceSimStatus>('idle');
  // Ref to avoid stale closure issues in speech recognition callbacks
  const voiceSimStatusRef = useRef<VoiceSimStatus>('idle');
  const [voiceSimTranscripts, setVoiceSimTranscripts] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const voiceSimWsRef = useRef<WebSocket | null>(null);
  const voiceSimDurationRef = useRef<number>(0);
  const [voiceSimDuration, setVoiceSimDuration] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const voiceSimTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const playPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Fetch available voices from API
  const { data: voicesData } = useQuery<VoicesByProvider>({
    queryKey: ['/api/voice-providers/voices'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-providers/voices');
      return parseJsonResponse<VoicesByProvider>(res, 'Voice list');
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Get voices for current provider with fallback
  const getVoicesForProvider = useCallback((provider: 'openai' | 'google'): VoiceInfo[] => {
    if (provider === 'openai') {
      return voicesData?.openai || FALLBACK_OPENAI_VOICES;
    } else {
      return voicesData?.gemini || FALLBACK_GEMINI_VOICES;
    }
  }, [voicesData]);

  // Update default voice when provider changes
  useEffect(() => {
    const voices = getVoicesForProvider(voiceProvider);
    if (voices.length > 0 && !voices.find(v => v.id === selectedVoice)) {
      setSelectedVoice(voices[0].id);
    }
  }, [voiceProvider, selectedVoice, getVoicesForProvider]);

  // Keep voiceSimStatusRef in sync with state (avoids stale closure in speech recognition callbacks)
  useEffect(() => {
    voiceSimStatusRef.current = voiceSimStatus;
    console.log('[VoiceSim] Status ref synced:', voiceSimStatus);
  }, [voiceSimStatus]);

  // Auto-load prompt when campaign and account are selected (or change)
  useEffect(() => {
    const autoLoadPrompt = async () => {
      if (!campaignId || !accountId) {
        // Clear prompt when no campaign/account selected
        setCustomSystemPrompt("");
        setCustomFirstMessage("");
        setPromptLoaded(false);
        return;
      }

      setIsLoadingPrompt(true);
      try {
        const params = new URLSearchParams();
        params.set('campaignId', campaignId);
        params.set('accountId', accountId);
        if (contactId) params.set('contactId', contactId);

        const response = await apiRequest('GET', `/api/preview-studio/assembled-prompt?${params.toString()}`);
        const data = await parseJsonResponse<any>(response, 'Auto-load prompt');

        setCustomSystemPrompt(data.systemPrompt || '');
        setCustomFirstMessage(data.firstMessage || '');
        setPromptLoaded(true);
      } catch (error) {
        console.error("Auto-load prompt failed:", error);
        // Clear and mark as not loaded so user can try again
        setCustomSystemPrompt("");
        setCustomFirstMessage("");
        setPromptLoaded(false);
      } finally {
        setIsLoadingPrompt(false);
      }
    };

    autoLoadPrompt();
  }, [campaignId, accountId, contactId]);

  // Handle voice preview using the new voice-providers API
  const handlePreviewVoice = async () => {
    try {
      if (playPreviewRef.current) {
        playPreviewRef.current.pause();
        playPreviewRef.current = null;
      }

      // Map provider name to API format (google -> gemini)
      const providerForApi = voiceProvider === 'google' ? 'gemini' : 'openai';

      const response = await apiRequest(
        "POST",
        '/api/voice-providers/preview',
        { voiceId: selectedVoice, provider: providerForApi }
      );

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      playPreviewRef.current = audio;
      await audio.play();
    } catch (error) {
       console.error(error);
       toast({
        variant: "destructive",
        title: "Preview Failed",
        description: "Could not play voice preview",
      });
    }
  };

  // Load assembled prompt for editing
  const handleLoadPrompt = async () => {
    if (!campaignId || !accountId) {
      toast({
        variant: "destructive",
        title: "Missing Context",
        description: "Please select a campaign and account first",
      });
      return;
    }

    setIsLoadingPrompt(true);
    try {
      const params = new URLSearchParams();
      params.set('campaignId', campaignId);
      params.set('accountId', accountId);
      if (contactId) params.set('contactId', contactId);

      const response = await apiRequest('GET', `/api/preview-studio/assembled-prompt?${params.toString()}`);
      const data = await parseJsonResponse<any>(response, 'Load prompt');

      setCustomSystemPrompt(data.systemPrompt || '');
      setCustomFirstMessage(data.firstMessage || '');
      setPromptLoaded(true);

      toast({
        title: "Prompt Loaded",
        description: "You can now edit the system prompt and first message",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Failed to Load Prompt",
        description: "Could not fetch the assembled prompt",
      });
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Reset prompt to reload from server
  const handleResetPrompt = () => {
    setCustomSystemPrompt("");
    setCustomFirstMessage("");
    setPromptLoaded(false);
  };

  // Auto-scroll transcripts
  useEffect(() => {
    if (scrollViewportRef.current) {
      // Scroll the viewport to the bottom
      const viewport = scrollViewportRef.current;
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [transcripts]);

  // Duration timer
  useEffect(() => {
    if (callStatus === 'in_progress') {
      timerRef.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Phone test mutation
  const phoneTestMutation = useMutation({
    mutationFn: async () => {
      if (!campaignId || !accountId) {
        throw new Error("Campaign and account are required");
      }
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error("Please enter a valid phone number");
      }

      // Build request body with all configuration
      const requestBody: Record<string, any> = {
        campaignId,
        accountId,
        contactId,
        testPhoneNumber: phoneNumber,
        voiceProvider,
        voice: selectedVoice,
      };

      // Add OpenAI-specific configuration if using OpenAI
      if (voiceProvider === 'openai') {
        requestBody.turnDetection = turnDetection;
        requestBody.eagerness = eagerness;
        requestBody.maxTokens = maxTokens;
      }

      // Add custom prompts if loaded and modified
      if (promptLoaded) {
        if (customSystemPrompt) {
          requestBody.customSystemPrompt = customSystemPrompt;
        }
        if (customFirstMessage) {
          requestBody.customFirstMessage = customFirstMessage;
        }
      }

      const response = await apiRequest("POST", "/api/preview-studio/phone-test/start", requestBody);
      return parseJsonResponse<any>(response, 'Start phone test');
    },
    onMutate: () => {
      setCallStatus('initiating');
      setError(null);
      setCallDuration(0);
      setTranscripts([]);
    },
    onSuccess: (data) => {
      setActiveSession(data);
      setCallStatus('ringing');

      // Add system message
      setTranscripts([{
        role: 'system',
        content: `Phone test initiated. Calling ${data.phoneNumber}...`,
        timestamp: new Date(),
      }]);

      toast({
        title: "Call Initiated",
        description: "Your phone should ring shortly. Answer to test the AI agent.",
      });

      // Simulate call progress (in real app, this would come from WebSocket/polling)
      setTimeout(() => {
        if (callStatus === 'ringing') {
          setCallStatus('in_progress');
          setTranscripts(prev => [...prev, {
            role: 'system',
            content: 'Call connected. AI agent is speaking...',
            timestamp: new Date(),
          }]);
        }
      }, 5000);
    },
    onError: (error: Error) => {
      setCallStatus('failed');
      setError(error.message);
      toast({
        variant: "destructive",
        title: "Call Failed",
        description: error.message,
      });
    },
  });

  const handleStartPhoneTest = () => {
    phoneTestMutation.mutate();
  };

  // TRUE TEXT SIMULATION - No telephony required
  const textSimulationMutation = useMutation({
    mutationFn: async () => {
      // Build simulation request with assembled prompt
      const simRequest: any = {
        campaignId: campaignId || undefined,
        accountId: accountId || undefined,
        contactId: contactId || undefined,
        personaPreset: selectedPersona,
        maxTurns: 12,
        runFullSimulation: true,
      };
      
      // Always include prompt if available (from Preview Studio auto-load)
      if (customSystemPrompt) {
        simRequest.customSystemPrompt = customSystemPrompt;
      }
      if (customFirstMessage) {
        simRequest.customFirstMessage = customFirstMessage;
      }
      
      console.log('[TextSim] Starting with config:', {
        campaignId: simRequest.campaignId,
        accountId: simRequest.accountId,
        hasSystemPrompt: !!simRequest.customSystemPrompt,
        promptLength: simRequest.customSystemPrompt?.length,
      });
      
      const res = await apiRequest('POST', '/api/simulations/start', simRequest);
      if (!res.ok) {
        throw await parseErrorMessage(res, 'Simulation');
      }
      return parseJsonResponse<any>(res, 'Simulation');
    },
    onMutate: () => {
      setTextSimStatus('running');
      setError(null);
      setTextSimResult(null);
    },
    onSuccess: (data) => {
      setTextSimStatus('completed');
      setTextSimResult(data.session);
      toast({
        title: 'Simulation Complete',
        description: `Score: ${data.session?.evaluation?.overallScore || 0}/100`,
      });
    },
    onError: (error: Error) => {
      setTextSimStatus('error');
      setError(error.message);
      toast({
        variant: 'destructive',
        title: 'Simulation Failed',
        description: error.message,
      });
    },
  });

  const handleStartTextSimulation = () => {
    textSimulationMutation.mutate();
  };

  const handleResetTextSimulation = () => {
    setTextSimStatus('idle');
    setTextSimResult(null);
    setError(null);
  };

  // Track if TTS is speaking (to prevent echo)
  const isSpeakingRef = useRef<boolean>(false);
  // Track if we're waiting for AI response (to keep recognition alive)
  const isWaitingForAIRef = useRef<boolean>(false);
  // Audio element ref for server-side TTS playback
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Server-side TTS with Gemini voices - consistent voice across all messages
  const speakText = useCallback(async (text: string) => {
    // Pause recognition to prevent echo
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    isSpeakingRef.current = true;

    try {
      // Use the selected voice and provider (Gemini Kore by default)
      const provider = voiceProvider === 'google' ? 'gemini' : 'openai';
      const voice = selectedVoice || 'Kore';
      
      console.log(`[VoiceSim] Generating TTS with ${provider}/${voice}`);
      
      // Call server TTS API
      const response = await apiRequest('POST', '/api/voice-providers/tts', {
        text,
        voiceId: voice,
        provider,
      });

      if (!response.ok) {
        const errMsg = await parseErrorMessage(response, 'TTS generation').then(e => e.message);
        throw new Error(`TTS API failed: ${errMsg}`);
      }
      
      // Validate response is audio
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('audio')) {
        console.warn(`[VoiceSim] Unexpected content-type: ${contentType}. Expected audio/*`);
      }

      const audioBlob = await response.blob();
      
      // Validate audio blob
      if (audioBlob.size === 0) {
        console.warn('[VoiceSim] Warning: TTS returned empty blob');
        throw new Error('TTS returned empty audio');
      }
      
      console.log(`[VoiceSim] Received audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Clean up previous audio element
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        URL.revokeObjectURL(ttsAudioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;
      
      // Ensure audio can be heard
      audio.volume = 1.0;
      audio.preload = 'auto';

      // Resume recognition after audio finishes
      audio.onended = () => {
        isSpeakingRef.current = false;
        URL.revokeObjectURL(audioUrl);
        console.log('[VoiceSim] TTS ended, restarting mic. Status ref:', voiceSimStatusRef.current);
        // Wait a moment after TTS ends to avoid catching tail-end audio
        setTimeout(() => {
          if (recognitionRef.current && voiceSimStatusRef.current === 'active') {
            try {
              console.log('[VoiceSim] Starting recognition after TTS');
              recognitionRef.current.start();
            } catch (e) {
              console.log('[VoiceSim] Recognition start error (may already be running):', e);
            }
          }
        }, 300);
      };

      audio.onerror = (err: any) => {
        isSpeakingRef.current = false;
        URL.revokeObjectURL(audioUrl);
        const errorCode = audio.error?.code || 'unknown';
        const errorMsg = audio.error?.message || String(err);
        console.error(`[VoiceSim] TTS audio error (${errorCode}): ${errorMsg}`);
        // Resume recognition even on error
        setTimeout(() => {
          if (recognitionRef.current && voiceSimStatusRef.current === 'active') {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        }, 300);
      };
      
      audio.onloadstart = () => console.log('[VoiceSim] Audio loading started');
      audio.oncanplay = () => console.log('[VoiceSim] Audio ready to play');
      audio.onplaying = () => console.log('[VoiceSim] Audio playing');

      console.log('[VoiceSim] Attempting to play audio:', audioUrl.slice(0, 50) + '...');
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch((err: any) => {
          console.error('[VoiceSim] Play failed:', err);
          isSpeakingRef.current = false;
          // Resume recognition on play error
          setTimeout(() => {
            if (recognitionRef.current && voiceSimStatusRef.current === 'active') {
              try {
                recognitionRef.current.start();
              } catch (e) {}
            }
          }, 300);
        });
      }
    } catch (error) {
      console.error('[VoiceSim] Server TTS failed:', error);
      isSpeakingRef.current = false;
      // Resume recognition on error
      setTimeout(() => {
        if (recognitionRef.current && voiceSimStatusRef.current === 'active') {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }, 300);
    }
  }, [voiceProvider, selectedVoice]);

  // Speech recognition ref
  const recognitionRef = useRef<any>(null);

  // VOICE SIMULATION - Browser-based with Speech Recognition & TTS
  const handleStartVoiceSimulation = async () => {
    try {
      voiceSimStatusRef.current = 'connecting'; // Update ref immediately
      setVoiceSimStatus('connecting');
      setError(null);
      setVoiceSimTranscripts([]);
      setVoiceSimDuration(0);
      voiceSimDurationRef.current = 0;

      // Check for speech recognition support
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser. Try Chrome.');
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Build simulation request with assembled prompt
      const simRequest: any = {
        campaignId: campaignId || undefined,
        accountId: accountId || undefined,
        contactId: contactId || undefined,
        personaPreset: selectedPersona || 'neutral_dm',
        maxTurns: 20,
        runFullSimulation: false, // Interactive mode
      };
      
      // Always include prompt if available (from Preview Studio auto-load)
      if (customSystemPrompt) {
        simRequest.customSystemPrompt = customSystemPrompt;
      }
      if (customFirstMessage) {
        simRequest.customFirstMessage = customFirstMessage;
      }
      
      console.log('[VoiceSim] Starting with config:', {
        campaignId: simRequest.campaignId,
        accountId: simRequest.accountId,
        hasSystemPrompt: !!simRequest.customSystemPrompt,
        promptLength: simRequest.customSystemPrompt?.length,
      });
      
      const res = await apiRequest('POST', '/api/simulations/start', simRequest);

      if (!res.ok) {
        stream.getTracks().forEach(track => track.stop());
        throw await parseErrorMessage(res, 'Voice simulation');
      }

      const data = await parseJsonResponse<any>(res, 'Voice simulation');
      
      // Store session
      (window as any).__voiceSimSession = data.session;
      (window as any).__voiceSimStream = stream;

      // Set up speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;

      recognition.onresult = async (event: any) => {
        console.log('[VoiceSim] recognition.onresult fired. isSpeaking:', isSpeakingRef.current);
        // ECHO PREVENTION: Ignore input while TTS is speaking
        if (isSpeakingRef.current) {
          console.log('[VoiceSim] Ignoring recognition result - TTS is speaking');
          return;
        }
        
        const last = event.results.length - 1;
        const userText = event.results[last][0].transcript;
        console.log('[VoiceSim] User said:', userText);
        
        if (userText.trim()) {
          // Add user message to transcript
          setVoiceSimTranscripts(prev => [...prev, {
            role: 'user',
            content: userText,
            timestamp: new Date(),
          }]);

          // Mark that we're waiting for AI response (keeps recognition from stopping)
          isWaitingForAIRef.current = true;
          console.log('[VoiceSim] Waiting for AI response...');

          // Send to simulation API for AI response
          try {
            const msgRes = await apiRequest('POST', '/api/simulations/message', {
              sessionId: (window as any).__voiceSimSession?.id,
              humanMessage: userText,
            });
            
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              console.log('[VoiceSim] API response:', msgData);
              const aiResponse = msgData.agentResponse || msgData.response;
              
              if (aiResponse) {
                // Add AI response to transcript
                setVoiceSimTranscripts(prev => [...prev, {
                  role: 'agent',
                  content: aiResponse,
                  timestamp: new Date(),
                }]);
                
                // Speak the response (this will set isSpeakingRef and restart recognition after)
                speakText(aiResponse);
              }
            } else {
              console.error('[VoiceSim] API error:', await msgRes.text());
            }
          } catch (err) {
            console.error('[VoiceSim] Failed to get AI response:', err);
          } finally {
            // Clear waiting flag after AI response (or error)
            isWaitingForAIRef.current = false;
            console.log('[VoiceSim] Done waiting for AI response');
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[VoiceSim] Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied');
        }
      };

      recognition.onend = () => {
        console.log('[VoiceSim] recognition.onend fired. isSpeaking:', isSpeakingRef.current, 'isWaitingForAI:', isWaitingForAIRef.current, 'statusRef:', voiceSimStatusRef.current);
        // ECHO PREVENTION: Don't auto-restart if TTS is speaking
        if (isSpeakingRef.current) {
          console.log('[VoiceSim] Not restarting recognition - TTS is speaking');
          return;
        }
        // Keep recognition alive while waiting for AI response
        if (isWaitingForAIRef.current) {
          console.log('[VoiceSim] Restarting recognition - waiting for AI response');
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.log('[VoiceSim] Recognition restart error (waiting for AI):', e);
          }
          return;
        }
        // Restart if still active (use ref to avoid stale closure)
        if (voiceSimStatusRef.current === 'active' && recognitionRef.current) {
          try {
            console.log('[VoiceSim] Restarting recognition after onend');
            recognitionRef.current.start();
          } catch (e) {
            console.log('[VoiceSim] Recognition restart error:', e);
          }
        }
      };

      // Start recognition
      recognition.start();
      voiceSimStatusRef.current = 'active'; // Update ref immediately (state update is async)
      setVoiceSimStatus('active');

      // Start duration timer
      voiceSimTimerRef.current = setInterval(() => {
        voiceSimDurationRef.current += 1;
        setVoiceSimDuration(voiceSimDurationRef.current);
      }, 1000);

      // Speak initial greeting - use customFirstMessage if server returns unsubstituted variables
      if (data.session?.transcript?.length > 0) {
        let firstMessage = data.session.transcript[0].content || '';
        
        // Check if server returned unsubstituted template variables
        if (firstMessage.includes('{{') && customFirstMessage && !customFirstMessage.includes('{{')) {
          firstMessage = customFirstMessage;
        }
        
        setVoiceSimTranscripts([{
          role: 'agent',
          content: firstMessage,
          timestamp: new Date(),
        }]);
        // Speak the greeting after a short delay
        setTimeout(() => speakText(firstMessage), 500);
      } else if (customFirstMessage) {
        // No transcript from server, use local first message
        setVoiceSimTranscripts([{
          role: 'agent',
          content: customFirstMessage,
          timestamp: new Date(),
        }]);
        setTimeout(() => speakText(customFirstMessage), 500);
      }

      toast({
        title: 'Voice Simulation Active',
        description: 'Listening... Speak to interact with the AI agent.',
      });

    } catch (err: any) {
      console.error('Voice simulation error:', err);
      voiceSimStatusRef.current = 'error'; // Update ref immediately
      setVoiceSimStatus('error');
      setError(err.message || 'Failed to start voice simulation');
      toast({
        variant: 'destructive',
        title: 'Voice Simulation Failed',
        description: err.message || 'Could not access microphone or start simulation',
      });
    }
  };

  const handleEndVoiceSimulation = () => {
    // Reset speaking flag first
    isSpeakingRef.current = false;
    
    // Stop speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Stop any ongoing speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Stop timer
    if (voiceSimTimerRef.current) {
      clearInterval(voiceSimTimerRef.current);
      voiceSimTimerRef.current = null;
    }

    // Stop microphone stream
    const stream = (window as any).__voiceSimStream;
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      delete (window as any).__voiceSimStream;
    }

    // Clean up session
    delete (window as any).__voiceSimSession;

    voiceSimStatusRef.current = 'completed'; // Update ref immediately
    setVoiceSimStatus('completed');
    toast({
      title: 'Voice Session Ended',
      description: `Duration: ${formatDuration(voiceSimDuration)}`,
    });
  };

  const handleResetVoiceSimulation = () => {
    voiceSimStatusRef.current = 'idle'; // Update ref immediately
    setVoiceSimStatus('idle');
    setVoiceSimTranscripts([]);
    setVoiceSimDuration(0);
    voiceSimDurationRef.current = 0;
    setError(null);
  };

  // Mutation to hang up call
  const hangupMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('POST', `/api/preview-studio/phone-test/${sessionId}/hangup`);
      if (!response.ok) {
        throw await parseErrorMessage(response, 'End call');
      }
      return parseJsonResponse<any>(response, 'End call');
    },
    onSuccess: () => {
      setCallStatus('completed');
      setTranscripts(prev => [...prev, {
        role: 'system',
        content: `Call ended by user. Duration: ${formatDuration(callDuration)}`,
        timestamp: new Date(),
      }]);
      toast({
        title: "Call Ended",
        description: "The call has been terminated successfully.",
      });
    },
    onError: (error: Error) => {
      console.error("Hangup error:", error);
      // Still mark as completed even on error - call might have already ended
      setCallStatus('completed');
      setTranscripts(prev => [...prev, {
        role: 'system',
        content: `Call ended. Duration: ${formatDuration(callDuration)}`,
        timestamp: new Date(),
      }]);
      toast({
        variant: "destructive",
        title: "End Call",
        description: error.message || "Call ended (may have already been disconnected)",
      });
    },
  });

  const handleEndCall = () => {
    if (activeSession?.sessionId) {
      hangupMutation.mutate(activeSession.sessionId);
    } else {
      // No session - just reset state
      setCallStatus('completed');
      setTranscripts(prev => [...prev, {
        role: 'system',
        content: `Call ended. Duration: ${formatDuration(callDuration)}`,
        timestamp: new Date(),
      }]);
    }
  };

  const handleReset = () => {
    setCallStatus('idle');
    setActiveSession(null);
    setTranscripts([]);
    setError(null);
    setCallDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const canStartCall = campaignId && accountId && phoneNumber.length >= 10 && callStatus === 'idle';
  const isCallActive = callStatus === 'ringing' || callStatus === 'in_progress';

  return (
    <div className="space-y-6 pb-32 relative min-h-screen">
      {/* Intro Header */}
      <div className="flex flex-col space-y-1 pb-2">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
          Simulation Lab
        </h2>
        <p className="text-sm text-muted-foreground">
          Test your AI agent with browser-based voice simulation (free) or real phone calls.
        </p>
      </div>

      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as SimulationMode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="voice" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Voice Sim
            <Badge variant="secondary" className="ml-1 text-xs">Free</Badge>
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Live Call
          </TabsTrigger>
        </TabsList>

        {/* VOICE SIMULATION TAB - Modern Voice UI */}
        <TabsContent value="voice" className="h-full">
          {/* Background with diagonal stripes - Purple theme */}
          <div className="relative min-h-[600px] rounded-2xl overflow-hidden bg-gradient-to-br from-purple-50 via-white to-violet-50 dark:from-purple-950/30 dark:via-slate-800 dark:to-violet-950/30">
            {/* Subtle diagonal stripe pattern */}
            <div 
              className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 10px,
                  currentColor 10px,
                  currentColor 11px
                )`
              }}
            />

            {/* Top Right - Switch to text mode */}
            <div className="absolute top-4 right-4 z-10">
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setMode('text')}
              >
                <MessageSquare className="h-4 w-4" />
                Switch to text mode
              </Button>
            </div>

            {/* Main Content - Centered */}
            <div className="relative flex flex-col items-center justify-center min-h-[600px] py-12">
              
              {/* Animated Voice Orb - Purple Theme */}
              <div className="relative">
                {/* Outer glow ring */}
                <div className={cn(
                  "absolute -inset-4 rounded-full transition-all duration-1000",
                  voiceSimStatus === 'active' 
                    ? "bg-gradient-to-r from-purple-400/30 via-violet-500/30 to-fuchsia-400/30 animate-pulse blur-xl" 
                    : voiceSimStatus === 'connecting'
                    ? "bg-gradient-to-r from-purple-400/20 via-violet-500/20 to-fuchsia-400/20 animate-pulse blur-xl"
                    : "bg-gradient-to-r from-purple-400/10 via-violet-500/10 to-fuchsia-400/10 blur-lg"
                )} />
                
                {/* Main orb container */}
                <div className={cn(
                  "relative w-64 h-64 rounded-full overflow-hidden shadow-2xl transition-transform duration-500",
                  voiceSimStatus === 'active' && "scale-105",
                  voiceSimStatus === 'connecting' && "animate-pulse"
                )}>
                  {/* Gradient background with animation */}
                  <div 
                    className={cn(
                      "absolute inset-0 transition-all duration-1000",
                      voiceSimStatus === 'active' 
                        ? "animate-spin-slow" 
                        : ""
                    )}
                    style={{
                      background: voiceSimStatus === 'error' 
                        ? 'conic-gradient(from 0deg, #ef4444, #f87171, #fca5a5, #ef4444)'
                        : voiceSimStatus === 'completed'
                        ? 'conic-gradient(from 0deg, #22c55e, #4ade80, #86efac, #22c55e)'
                        : 'conic-gradient(from 0deg, #a855f7, #8b5cf6, #7c3aed, #6d28d9, #a855f7)',
                    }}
                  />
                  
                  {/* Inner lighter gradient overlay */}
                  <div 
                    className="absolute inset-4 rounded-full"
                    style={{
                      background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%)',
                    }}
                  />
                  
                  {/* Center content - Action button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button
                      variant="secondary"
                      size="lg"
                      className={cn(
                        "rounded-full h-14 px-6 gap-3 bg-white/95 dark:bg-slate-900/95 hover:bg-white dark:hover:bg-slate-900 shadow-xl backdrop-blur-sm border-0 transition-all duration-300",
                        voiceSimStatus === 'active' && "bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900"
                      )}
                      onClick={voiceSimStatus === 'idle' || voiceSimStatus === 'completed' || voiceSimStatus === 'error' 
                        ? () => handleStartVoiceSimulation() 
                        : handleEndVoiceSimulation}
                      disabled={voiceSimStatus === 'connecting'}
                    >
                      {voiceSimStatus === 'connecting' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : voiceSimStatus === 'idle' || voiceSimStatus === 'completed' || voiceSimStatus === 'error' ? (
                        <Mic className="h-5 w-5 text-purple-700 dark:text-purple-300" />
                      ) : (
                        <MicOff className="h-5 w-5 text-red-600" />
                      )}
                      <span className={cn(
                        "font-medium",
                        voiceSimStatus === 'active' && "text-red-700 dark:text-red-400"
                      )}>
                        {voiceSimStatus === 'connecting' ? 'Connecting...' :
                         voiceSimStatus === 'idle' ? 'Talk to AI agent' :
                         voiceSimStatus === 'active' ? 'End conversation' :
                         voiceSimStatus === 'completed' ? 'Start new' :
                         'Try again'}
                      </span>
                    </Button>
                  </div>
                </div>
                
                {/* Live indicator badge */}
                {voiceSimStatus === 'active' && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-500 text-white gap-1 animate-pulse shadow-lg">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      LIVE • {formatDuration(voiceSimDuration)}
                    </Badge>
                  </div>
                )}

                {/* Mute button during active session */}
                {voiceSimStatus === 'active' && (
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMuted(!isMuted)}
                      className={cn(
                        "rounded-full gap-2 bg-white/90 dark:bg-slate-900/90 shadow-lg",
                        isMuted && "bg-red-100 dark:bg-red-900/50 border-red-300"
                      )}
                    >
                      {isMuted ? <MicOff className="h-4 w-4 text-red-500" /> : <Mic className="h-4 w-4" />}
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Status text below orb */}
              <div className="mt-12 text-center">
                {voiceSimStatus === 'idle' && !promptLoaded && (
                  <p className="text-sm text-muted-foreground">
                    {!campaignId ? 'Select a campaign to start' :
                     !accountId ? 'Select an account to start' :
                     isLoadingPrompt ? 'Loading agent context...' :
                     'Click to load agent context'}
                  </p>
                )}
                {voiceSimStatus === 'idle' && promptLoaded && (
                  <p className="text-sm text-muted-foreground">
                    Click the button above to start talking
                  </p>
                )}
                {voiceSimStatus === 'active' && (
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Speak into your microphone...
                  </p>
                )}
                {voiceSimStatus === 'completed' && (
                  <p className="text-sm text-green-600">
                    Conversation ended • {voiceSimTranscripts.length} messages
                  </p>
                )}
                {voiceSimStatus === 'error' && (
                  <p className="text-sm text-red-600">
                    {error || 'Something went wrong'}
                  </p>
                )}
              </div>

              {/* Show transcript button */}
              {voiceSimTranscripts.length > 0 && (voiceSimStatus === 'idle' || voiceSimStatus === 'completed') && (
                <Button 
                  variant="outline" 
                  className="mt-6 rounded-full gap-2"
                  onClick={() => {
                    document.getElementById('voice-sim-transcripts')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Show conversation
                </Button>
              )}

              {/* Microphone access notice */}
              <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                Uses browser microphone • No telephony costs
              </p>
            </div>

            {/* Expandable Settings Panel - Top Left */}
            <div className="absolute top-4 left-4 z-10">
              <Collapsible open={showAdvancedConfig} onOpenChange={setShowAdvancedConfig}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                    <Settings className="h-4 w-4" />
                    Settings
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvancedConfig && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <Card className="w-80 shadow-xl backdrop-blur-sm bg-white/95 dark:bg-slate-900/95">
                    <CardContent className="p-4 space-y-4">
                      {/* Voice Selection */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">AI Voice</Label>
                        <div className="flex gap-2">
                          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                            <SelectTrigger className="h-9 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getVoicesForProvider(voiceProvider).map(voice => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.displayName || voice.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handlePreviewVoice}>
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Provider */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Provider</Label>
                        <Select value={voiceProvider} onValueChange={(v: "openai" | "google") => setVoiceProvider(v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI Realtime</SelectItem>
                            <SelectItem value="google">Google Gemini</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Prompt Status */}
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Agent Context</span>
                          {promptLoaded ? (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Loaded
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Not loaded</Badge>
                          )}
                        </div>
                        {promptLoaded && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Using campaign prompt with {customSystemPrompt.length} chars
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          {/* Transcript Section - Shows when there are transcripts */}
          {voiceSimTranscripts.length > 0 && (
            <div id="voice-sim-transcripts" className="mt-6">
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5" />
                      Conversation Transcript
                    </CardTitle>
                    {voiceSimStatus === 'completed' && (
                      <Button variant="outline" size="sm" onClick={handleResetVoiceSimulation} className="gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Clear
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                      {voiceSimTranscripts.map((entry, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3",
                            entry.role === 'user' && "justify-end"
                          )}
                        >
                          {entry.role !== 'user' && (
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                              <Bot className="h-4 w-4 text-purple-600" />
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[85%] rounded-xl px-4 py-3",
                            entry.role === 'user' ? "bg-primary text-primary-foreground" :
                            "bg-purple-50 dark:bg-purple-900/20"
                          )}>
                            <p className="text-sm leading-relaxed">{entry.content}</p>
                            <p className="text-xs opacity-60 mt-1">
                              {entry.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                          {entry.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* PHONE CALL TAB - Modern Voice UI */}
        <TabsContent value="phone" className="h-full">
          {/* Background with diagonal stripes */}
          <div className="relative min-h-[600px] rounded-2xl overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            {/* Subtle diagonal stripe pattern */}
            <div 
              className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 10px,
                  currentColor 10px,
                  currentColor 11px
                )`
              }}
            />

            {/* Top Right - Switch to chat mode */}
            <div className="absolute top-4 right-4 z-10">
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setMode('text')}
              >
                <MessageSquare className="h-4 w-4" />
                Switch to chat mode
              </Button>
            </div>

            {/* Main Content - Centered */}
            <div className="relative flex flex-col items-center justify-center min-h-[600px] py-12">
              
              {/* Animated Voice Orb */}
              <div className="relative">
                {/* Outer glow ring */}
                <div className={cn(
                  "absolute -inset-4 rounded-full transition-all duration-1000",
                  callStatus === 'in_progress' 
                    ? "bg-gradient-to-r from-cyan-400/30 via-blue-500/30 to-teal-400/30 animate-pulse blur-xl" 
                    : callStatus === 'ringing'
                    ? "bg-gradient-to-r from-yellow-400/30 via-orange-500/30 to-amber-400/30 animate-pulse blur-xl"
                    : "bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-teal-400/10 blur-lg"
                )} />
                
                {/* Main orb container */}
                <div className={cn(
                  "relative w-64 h-64 rounded-full overflow-hidden shadow-2xl transition-transform duration-500",
                  callStatus === 'in_progress' && "scale-105",
                  callStatus === 'ringing' && "animate-pulse"
                )}>
                  {/* Gradient background with animation */}
                  <div 
                    className={cn(
                      "absolute inset-0 transition-all duration-1000",
                      callStatus === 'in_progress' 
                        ? "animate-spin-slow" 
                        : ""
                    )}
                    style={{
                      background: callStatus === 'failed' 
                        ? 'conic-gradient(from 0deg, #ef4444, #f87171, #fca5a5, #ef4444)'
                        : callStatus === 'completed'
                        ? 'conic-gradient(from 0deg, #22c55e, #4ade80, #86efac, #22c55e)'
                        : 'conic-gradient(from 0deg, #0ea5e9, #06b6d4, #14b8a6, #0d9488, #0ea5e9)',
                    }}
                  />
                  
                  {/* Inner lighter gradient overlay */}
                  <div 
                    className="absolute inset-4 rounded-full"
                    style={{
                      background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%)',
                    }}
                  />
                  
                  {/* Center content - Action button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button
                      variant="secondary"
                      size="lg"
                      className={cn(
                        "rounded-full h-14 px-6 gap-3 bg-white/95 dark:bg-slate-900/95 hover:bg-white dark:hover:bg-slate-900 shadow-xl backdrop-blur-sm border-0 transition-all duration-300",
                        callStatus === 'in_progress' && "bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900",
                        (phoneTestMutation.isPending || hangupMutation.isPending) && "opacity-80"
                      )}
                      onClick={callStatus === 'idle' ? handleStartPhoneTest : handleEndCall}
                      disabled={callStatus === 'idle' ? (!canStartCall || phoneTestMutation.isPending) : hangupMutation.isPending}
                    >
                      {phoneTestMutation.isPending || hangupMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : callStatus === 'idle' ? (
                        <Mic className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                      ) : callStatus === 'ringing' ? (
                        <Radio className="h-5 w-5 text-yellow-600 animate-pulse" />
                      ) : callStatus === 'in_progress' ? (
                        <PhoneOff className="h-5 w-5 text-red-600" />
                      ) : callStatus === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      )}
                      <span className={cn(
                        "font-medium",
                        callStatus === 'in_progress' && "text-red-700 dark:text-red-400"
                      )}>
                        {phoneTestMutation.isPending ? 'Connecting...' :
                         hangupMutation.isPending ? 'Ending...' :
                         callStatus === 'idle' ? 'Call AI agent' :
                         callStatus === 'ringing' ? 'Ringing...' :
                         callStatus === 'in_progress' ? 'End call' :
                         callStatus === 'completed' ? 'Call ended' :
                         'Try again'}
                      </span>
                    </Button>
                  </div>
                </div>
                
                {/* Live indicator badge */}
                {callStatus === 'in_progress' && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Badge className="bg-green-500 text-white gap-1 animate-pulse shadow-lg">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      LIVE • {formatDuration(callDuration)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Status text below orb */}
              <div className="mt-8 text-center">
                {callStatus === 'idle' && !canStartCall && (
                  <p className="text-sm text-muted-foreground">
                    {!campaignId ? 'Select a campaign to start' :
                     !accountId ? 'Select an account to start' :
                     phoneNumber.length < 10 ? 'Enter a phone number above' :
                     'Ready to call'}
                  </p>
                )}
                {callStatus === 'in_progress' && (
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Listening to your conversation...
                  </p>
                )}
              </div>

              {/* Show last conversation button */}
              {transcripts.length > 0 && callStatus === 'idle' && (
                <Button 
                  variant="outline" 
                  className="mt-6 rounded-full gap-2"
                  onClick={() => {
                    // Scroll to transcripts section
                    document.getElementById('phone-transcripts')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Show last conversation
                </Button>
              )}

              {/* Development discount notice */}
              <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                In-development calls are 50% off.
              </p>
            </div>

            {/* Expandable Settings Panel - Top Left */}
            <div className="absolute top-4 left-4 z-10">
              <Collapsible open={showAdvancedConfig} onOpenChange={setShowAdvancedConfig}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                    <Settings className="h-4 w-4" />
                    Settings
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvancedConfig && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <Card className="w-80 shadow-xl backdrop-blur-sm bg-white/95 dark:bg-slate-900/95">
                    <CardContent className="p-4 space-y-4">
                      {/* Phone Number */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Phone Number</Label>
                        <Input
                          type="tel"
                          placeholder="+1 (555) 123-4567"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      
                      {/* Voice Selection */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Voice</Label>
                        <div className="flex gap-2">
                          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                            <SelectTrigger className="h-9 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getVoicesForProvider(voiceProvider).map(voice => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.displayName || voice.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handlePreviewVoice}>
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Provider */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Provider</Label>
                        <Select value={voiceProvider} onValueChange={(v: "openai" | "google") => setVoiceProvider(v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI Realtime</SelectItem>
                            <SelectItem value="google">Google Gemini</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Prompt Preview Toggle */}
                      {promptLoaded && (
                        <div className="pt-2 border-t">
                          <Button variant="ghost" size="sm" className="w-full gap-2 text-xs" onClick={handleLoadPrompt}>
                            <Edit3 className="h-3 w-3" />
                            Edit Prompt
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          {/* Transcript Section - Shows when there are transcripts */}
          {transcripts.length > 0 && (
            <div id="phone-transcripts" className="mt-6 grid gap-6 lg:grid-cols-3">
              {/* Transcript Card */}
              <Card className="lg:col-span-2 border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" />
                    Conversation Transcript
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px] pr-4">
                    <div className="space-y-4" ref={(el) => {
                      if (el) {
                        scrollViewportRef.current = el.parentElement as HTMLDivElement;
                      }
                    }}>
                      {transcripts.map((entry, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3",
                            entry.role === 'user' && "justify-end"
                          )}
                        >
                          {entry.role !== 'user' && (
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                              entry.role === 'assistant' ? "bg-primary/10" : "bg-muted"
                            )}>
                              {entry.role === 'assistant' ? (
                                <Bot className="h-4 w-4 text-primary" />
                              ) : (
                                <Info className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[85%] rounded-xl px-4 py-3",
                            entry.role === 'user' ? "bg-primary text-primary-foreground" :
                            entry.role === 'assistant' ? "bg-muted" :
                            "bg-blue-50 dark:bg-blue-950/30"
                          )}>
                            <p className="text-sm leading-relaxed">{entry.content}</p>
                            <p className="text-xs opacity-60 mt-1">
                              {entry.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                          {entry.role === 'user' && (
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <User className="h-4 w-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Metrics Card */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-5 w-5" />
                    Call Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Duration</span>
                      <span className="font-mono font-medium">{formatDuration(callDuration)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={callStatus === 'completed' ? 'secondary' : 'default'}>
                        {callStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Messages</span>
                      <span className="font-medium">{transcripts.filter(t => t.role !== 'system').length}</span>
                    </div>
                  </div>

                  {callStatus === 'completed' && onAnalysisReady && transcripts.filter(t => t.role !== 'system').length >= 2 && (
                    <Button
                      size="sm"
                      className="w-full mt-4"
                      onClick={() => {
                        const conversationTranscripts = transcripts.filter(t => t.role !== 'system');
                        const messages = convertTranscriptsToMessages(conversationTranscripts);
                        const memory = buildSessionMemoryFromTranscripts(conversationTranscripts);
                        const report = generateEvaluationReport(messages, memory);
                        onAnalysisReady(report);
                      }}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analyze Call
                    </Button>
                  )}

                  {callStatus === 'idle' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleReset}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      New Test
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
