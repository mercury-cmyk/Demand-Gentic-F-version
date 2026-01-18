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

type SimulationMode = 'text' | 'voice' | 'phone';
type CallStatus = 'idle' | 'initiating' | 'ringing' | 'in_progress' | 'completed' | 'failed';
type TextSimStatus = 'idle' | 'running' | 'completed' | 'error';
type VoiceSimStatus = 'idle' | 'connecting' | 'active' | 'completed' | 'error';

interface BrowserSimulationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function LiveSimulationPanel({
  campaignId,
  accountId,
  contactId,
  onAnalysisReady,
}: LiveSimulationPanelProps) {
  const [mode, setMode] = useState<SimulationMode>('phone');
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
      return res.json();
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
        const data = await response.json();

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
      const data = await response.json();

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
      return response.json();
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
        const error = await res.json();
        throw new Error(error.message || 'Simulation failed');
      }
      return res.json();
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

  // Speech synthesis for TTS
  const speakText = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      // Try to use a natural voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => 
        v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')
      ) || voices[0];
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Speech recognition ref
  const recognitionRef = useRef<any>(null);

  // VOICE SIMULATION - Browser-based with Speech Recognition & TTS
  const handleStartVoiceSimulation = async () => {
    try {
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
        const error = await res.json();
        throw new Error(error.message || 'Failed to start voice simulation');
      }

      const data = await res.json();
      
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
        const last = event.results.length - 1;
        const userText = event.results[last][0].transcript;
        
        if (userText.trim()) {
          // Add user message to transcript
          setVoiceSimTranscripts(prev => [...prev, {
            role: 'user',
            content: userText,
            timestamp: new Date(),
          }]);

          // Send to simulation API for AI response
          try {
            const msgRes = await apiRequest('POST', '/api/simulations/message', {
              sessionId: (window as any).__voiceSimSession?.id,
              humanMessage: userText,
            });
            
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              const aiResponse = msgData.agentResponse || msgData.response;
              
              if (aiResponse) {
                // Add AI response to transcript
                setVoiceSimTranscripts(prev => [...prev, {
                  role: 'agent',
                  content: aiResponse,
                  timestamp: new Date(),
                }]);
                
                // Speak the response
                speakText(aiResponse);
              }
            }
          } catch (err) {
            console.error('Failed to get AI response:', err);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied');
        }
      };

      recognition.onend = () => {
        // Restart if still active
        if (voiceSimStatus === 'active' && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Already started or stopped
          }
        }
      };

      // Start recognition
      recognition.start();
      setVoiceSimStatus('active');

      // Start duration timer
      voiceSimTimerRef.current = setInterval(() => {
        voiceSimDurationRef.current += 1;
        setVoiceSimDuration(voiceSimDurationRef.current);
      }, 1000);

      // Speak initial greeting
      if (data.session?.transcript?.length > 0) {
        const firstTurn = data.session.transcript[0];
        setVoiceSimTranscripts([{
          role: 'agent',
          content: firstTurn.content,
          timestamp: new Date(),
        }]);
        // Speak the greeting
        setTimeout(() => speakText(firstTurn.content), 500);
      }

      toast({
        title: 'Voice Simulation Active',
        description: 'Listening... Speak to interact with the AI agent.',
      });

    } catch (err: any) {
      console.error('Voice simulation error:', err);
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

    setVoiceSimStatus('completed');
    toast({
      title: 'Voice Session Ended',
      description: `Duration: ${formatDuration(voiceSimDuration)}`,
    });
  };

  const handleResetVoiceSimulation = () => {
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to end call');
      }
      return response.json();
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
          Validate your AI agent with text simulations (free) or real voice calls.
        </p>
      </div>

      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as SimulationMode)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="text" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Text Sim
            <Badge variant="secondary" className="ml-1 text-xs">Free</Badge>
          </TabsTrigger>
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

        {/* TEXT SIMULATION TAB */}
        <TabsContent value="text" className="space-y-4">
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-900 dark:text-green-100">
              <strong>No Phone Required</strong> - This runs a full conversation simulation using AI personas. No telephony costs.
            </AlertDescription>
          </Alert>

          <Card className="border-0 shadow-lg bg-white dark:bg-card relative overflow-hidden ring-1 ring-border/50">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500" />
            <CardContent className="p-6 space-y-4">
              {error && mode === 'text' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {textSimStatus === 'idle' && (
                <>
                  {/* Persona Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      Simulated Human Persona
                    </Label>
                    <Select value={selectedPersona} onValueChange={setSelectedPersona}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select persona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly_dm">
                          <div className="flex items-center gap-2">
                            <span>Friendly Decision Maker</span>
                            <Badge variant="outline" className="text-xs">Easy</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="neutral_dm">
                          <div className="flex items-center gap-2">
                            <span>Neutral Decision Maker</span>
                            <Badge variant="outline" className="text-xs">Normal</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="skeptical_dm">
                          <div className="flex items-center gap-2">
                            <span>Skeptical Decision Maker</span>
                            <Badge variant="outline" className="text-xs">Hard</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="hostile_dm">
                          <div className="flex items-center gap-2">
                            <span>Hostile Decision Maker</span>
                            <Badge variant="destructive" className="text-xs">Very Hard</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="busy_executive">
                          <div className="flex items-center gap-2">
                            <span>Busy Executive</span>
                            <Badge variant="outline" className="text-xs">Time-limited</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="gatekeeper_assistant">
                          <div className="flex items-center gap-2">
                            <span>Gatekeeper (Assistant)</span>
                            <Badge variant="outline" className="text-xs">Screening</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Context Info */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {campaignId && <Badge variant="secondary">Campaign selected</Badge>}
                    {accountId && <Badge variant="secondary">Account selected</Badge>}
                    {promptLoaded && <Badge variant="secondary">Prompt loaded</Badge>}
                    {!campaignId && !accountId && (
                      <span className="text-amber-600">Optional: Select campaign/account for context</span>
                    )}
                  </div>

                  {/* Start Button */}
                  <Button
                    onClick={handleStartTextSimulation}
                    disabled={textSimulationMutation.isPending}
                    className="w-full h-12 text-lg gap-2"
                    size="lg"
                  >
                    {textSimulationMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Brain className="h-5 w-5" />
                    )}
                    {textSimulationMutation.isPending ? 'Running Simulation...' : 'Run Text Simulation'}
                  </Button>
                </>
              )}

              {textSimStatus === 'running' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <h3 className="text-lg font-semibold">Running Simulation...</h3>
                  <p className="text-sm text-muted-foreground">AI is conversing with the simulated human</p>
                </div>
              )}

              {textSimStatus === 'completed' && textSimResult && (
                <div className="space-y-4">
                  {/* Score Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center",
                        (textSimResult.evaluation?.overallScore || 0) >= 70 
                          ? "bg-green-500/20" 
                          : (textSimResult.evaluation?.overallScore || 0) >= 40
                          ? "bg-yellow-500/20"
                          : "bg-red-500/20"
                      )}>
                        <span className={cn(
                          "text-xl font-bold",
                          (textSimResult.evaluation?.overallScore || 0) >= 70 
                            ? "text-green-600" 
                            : (textSimResult.evaluation?.overallScore || 0) >= 40
                            ? "text-yellow-600"
                            : "text-red-600"
                        )}>
                          {textSimResult.evaluation?.overallScore || 0}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Simulation Complete</h3>
                        <p className="text-sm text-muted-foreground">
                          {textSimResult.currentTurn || 0} turns completed
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleResetTextSimulation} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Run Again
                    </Button>
                  </div>

                  {/* Transcript */}
                  {textSimResult.transcript && textSimResult.transcript.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Conversation Transcript</Label>
                      <ScrollArea className="h-[300px] border rounded-lg p-4 bg-muted/30">
                        <div className="space-y-3">
                          {textSimResult.transcript.map((turn: any, idx: number) => (
                            <div key={idx} className={cn(
                              "flex gap-3",
                              turn.role === 'agent' ? "justify-start" : "justify-end"
                            )}>
                              <div className={cn(
                                "max-w-[80%] rounded-lg p-3 text-sm",
                                turn.role === 'agent' 
                                  ? "bg-primary/10 text-foreground" 
                                  : "bg-muted text-foreground"
                              )}>
                                <div className="flex items-center gap-2 mb-1">
                                  {turn.role === 'agent' ? (
                                    <Bot className="h-3 w-3" />
                                  ) : (
                                    <User className="h-3 w-3" />
                                  )}
                                  <span className="text-xs font-medium uppercase">
                                    {turn.role === 'agent' ? 'AI Agent' : 'Human'}
                                  </span>
                                </div>
                                <p>{turn.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* Evaluation Metrics */}
                  {textSimResult.evaluation?.metrics && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Evaluation Metrics</Label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span>Identity Confirmed</span>
                          {textSimResult.evaluation.metrics.identityConfirmation ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span>Value Proposition</span>
                          {textSimResult.evaluation.metrics.valuePropositionDelivered ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span>Objections Handled</span>
                          <Badge variant="secondary">{textSimResult.evaluation.metrics.objectionsHandled || 0}</Badge>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span>Professional Tone</span>
                          {textSimResult.evaluation.metrics.toneProfessional ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {textSimStatus === 'error' && (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                  <h3 className="text-lg font-semibold">Simulation Failed</h3>
                  <p className="text-sm text-muted-foreground mb-4">{error}</p>
                  <Button variant="outline" onClick={handleResetTextSimulation}>
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VOICE SIMULATION TAB */}
        <TabsContent value="voice" className="space-y-4">
          <Alert className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
            <Mic className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-sm text-purple-900 dark:text-purple-100">
              <strong>Browser Voice Simulation</strong> - Talk directly to your AI agent using your microphone. No phone or telephony costs.
            </AlertDescription>
          </Alert>

          <Card className="border-0 shadow-lg bg-white dark:bg-card relative overflow-hidden ring-1 ring-border/50">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500" />
            <CardContent className="p-6 space-y-4">
              {error && mode === 'voice' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {voiceSimStatus === 'idle' && (
                <>
                  {/* Voice Selection Info */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      AI Agent Voice
                    </Label>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Badge variant="secondary">
                        {selectedVoice || 'Default Voice'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Your agent will speak using this voice
                      </span>
                    </div>
                  </div>

                  {/* Context Info */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {promptLoaded && <Badge variant="secondary">Prompt loaded</Badge>}
                    <span>Uses browser microphone for input</span>
                  </div>

                  {/* Requirements */}
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <Info className="h-4 w-4" />
                    <span>Microphone access required. Make sure to allow when prompted.</span>
                  </div>

                  {/* Start Button */}
                  <Button
                    onClick={() => handleStartVoiceSimulation()}
                    className="w-full h-12 text-lg gap-2 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600"
                    size="lg"
                  >
                    <Mic className="h-5 w-5" />
                    Start Voice Conversation
                  </Button>
                </>
              )}

              {voiceSimStatus === 'connecting' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-purple-500 mb-4" />
                  <h3 className="text-lg font-semibold">Connecting...</h3>
                  <p className="text-sm text-muted-foreground">Initializing voice simulation</p>
                </div>
              )}

              {voiceSimStatus === 'active' && (
                <div className="space-y-4">
                  {/* Active Call Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                        <Mic className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Voice Session Active</h3>
                        <p className="text-sm text-muted-foreground font-mono">
                          {formatDuration(voiceSimDuration)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsMuted(!isMuted)}
                        className={cn(isMuted && "bg-red-100 dark:bg-red-900/20")}
                      >
                        {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleEndVoiceSimulation}
                        className="gap-2"
                      >
                        <PhoneOff className="h-4 w-4" />
                        End
                      </Button>
                    </div>
                  </div>

                  {/* Audio Visualization Placeholder */}
                  <div className="h-20 bg-gradient-to-r from-purple-100 to-violet-100 dark:from-purple-950/30 dark:to-violet-950/30 rounded-lg flex items-center justify-center">
                    <div className="flex items-center gap-1">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-purple-500/60 rounded-full animate-pulse"
                          style={{
                            height: `${Math.random() * 40 + 10}px`,
                            animationDelay: `${i * 50}ms`
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Live Transcript */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Live Transcript</Label>
                    <ScrollArea className="h-[200px] border rounded-lg p-4 bg-muted/30">
                      <div className="space-y-3">
                        {voiceSimTranscripts.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            Speak into your microphone to start the conversation...
                          </p>
                        ) : (
                          voiceSimTranscripts.map((t, idx) => (
                            <div key={idx} className={cn(
                              "flex gap-3",
                              t.role === 'agent' ? "justify-start" : "justify-end"
                            )}>
                              <div className={cn(
                                "max-w-[80%] rounded-lg p-3 text-sm",
                                t.role === 'agent' 
                                  ? "bg-purple-100 dark:bg-purple-900/30" 
                                  : "bg-muted"
                              )}>
                                <div className="flex items-center gap-2 mb-1">
                                  {t.role === 'agent' ? (
                                    <Bot className="h-3 w-3" />
                                  ) : (
                                    <User className="h-3 w-3" />
                                  )}
                                  <span className="text-xs font-medium uppercase">
                                    {t.role === 'agent' ? 'AI Agent' : 'You'}
                                  </span>
                                </div>
                                <p>{t.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}

              {voiceSimStatus === 'completed' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Voice Session Complete</h3>
                        <p className="text-sm text-muted-foreground">
                          Duration: {formatDuration(voiceSimDuration)}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleResetVoiceSimulation} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Start New
                    </Button>
                  </div>

                  {/* Transcript Review */}
                  {voiceSimTranscripts.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Conversation Transcript</Label>
                      <ScrollArea className="h-[300px] border rounded-lg p-4 bg-muted/30">
                        <div className="space-y-3">
                          {voiceSimTranscripts.map((t, idx) => (
                            <div key={idx} className={cn(
                              "flex gap-3",
                              t.role === 'agent' ? "justify-start" : "justify-end"
                            )}>
                              <div className={cn(
                                "max-w-[80%] rounded-lg p-3 text-sm",
                                t.role === 'agent' 
                                  ? "bg-purple-100 dark:bg-purple-900/30" 
                                  : "bg-muted"
                              )}>
                                <p>{t.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              {voiceSimStatus === 'error' && (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                  <h3 className="text-lg font-semibold">Voice Simulation Failed</h3>
                  <p className="text-sm text-muted-foreground mb-4">{error}</p>
                  <Button variant="outline" onClick={handleResetVoiceSimulation}>
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PHONE CALL TAB */}
        <TabsContent value="phone" className="space-y-4">
      
      {/* Info Alert */}
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-sm text-blue-900 dark:text-blue-100">
          <strong>Live Testing</strong> makes real phone calls to validate your agent. This will use your Telnyx account and incur costs.
        </AlertDescription>
      </Alert>

      {/* Hero Configuration */}
      <Card className="border-0 shadow-lg bg-white dark:bg-card relative overflow-hidden ring-1 ring-border/50">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        <CardContent className="p-6">
          {error && mode === 'phone' && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {callStatus === 'idle' ? (
            <div className="grid md:grid-cols-2 gap-6 items-end">
              {/* Phone Number Input */}
              <div className="space-y-2">
                <Label htmlFor="phone-number" className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Target Phone Number
                </Label>
                <div className="relative">
                  <Input
                    id="phone-number"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="h-12 text-lg pl-4 shadow-sm"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {phoneNumber.length >= 10 && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  </div>
                </div>
              </div>

              {/* Voice Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" />
                  Agent Voice
                </Label>
                <div className="flex gap-2">
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger className="h-12 flex-1 shadow-sm">
                      <SelectValue placeholder="Voice" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {getVoicesForProvider(voiceProvider).map(voice => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <div className="flex items-center gap-2">
                            <span>{voice.displayName || voice.name}</span>
                            {voice.description && (
                              <span className="text-xs text-muted-foreground">- {voice.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 shrink-0 border"
                    onClick={handlePreviewVoice}
                    title="Preview Voice"
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Active/Completed Call State */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center",
                  callStatus === 'in_progress' ? "bg-green-500/20 animate-pulse" :
                  callStatus === 'ringing' ? "bg-yellow-500/20 animate-pulse" :
                  callStatus === 'completed' ? "bg-blue-500/20" : "bg-red-500/20"
                )}>
                  {callStatus === 'in_progress' ? (
                    <PhoneCall className="h-7 w-7 text-green-500" />
                  ) : callStatus === 'ringing' ? (
                    <Radio className="h-7 w-7 text-yellow-500" />
                  ) : callStatus === 'completed' ? (
                    <CheckCircle2 className="h-7 w-7 text-blue-500" />
                  ) : (
                    <AlertTriangle className="h-7 w-7 text-red-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">
                      {callStatus === 'initiating' && 'Initiating Call...'}
                      {callStatus === 'ringing' && 'Phone Ringing...'}
                      {callStatus === 'in_progress' && 'Call In Progress'}
                      {callStatus === 'completed' && 'Call Completed'}
                      {callStatus === 'failed' && 'Call Failed'}
                    </h3>
                    {isCallActive && (
                      <Badge className="font-mono">{formatDuration(callDuration)}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activeSession?.phoneNumber || phoneNumber}
                  </p>
                </div>
              </div>

              {isCallActive ? (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleEndCall}
                  disabled={hangupMutation.isPending}
                  className="gap-2 h-12 px-6"
                >
                  {hangupMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <PhoneOff className="h-5 w-5" />
                  )}
                  {hangupMutation.isPending ? "Ending..." : "End Call"}
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleReset}
                  className="gap-2 h-12 px-6"
                >
                  <Phone className="h-5 w-5" />
                  New Test
                </Button>
              )}
            </div>
          )}

          {/* Validation Messages */}
          {callStatus === 'idle' && (
            <div className="mt-3 flex items-center gap-4 text-sm">
              {!campaignId && (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Select a campaign
                </span>
              )}
              {campaignId && !accountId && (
                <span className="text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Select an account
                </span>
              )}
              {campaignId && accountId && phoneNumber.length < 10 && (
                <span className="text-muted-foreground">
                  Enter a valid phone number to start
                </span>
              )}
              {canStartCall && (
                <span className="text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ready to test
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Prompt Section - Always Visible */}
      {callStatus === 'idle' && (
        <Card className="border-0 shadow-md bg-white dark:bg-card ring-1 ring-border/50">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-indigo-500/20 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">AI Agent Prompt</CardTitle>
                  <CardDescription className="text-xs">
                    {promptLoaded ? "Edit the prompt below before testing" : "Load the assembled prompt to preview and edit"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {promptLoaded && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Loaded
                  </Badge>
                )}
                <Button
                  variant={promptLoaded ? "outline" : "default"}
                  size="sm"
                  onClick={handleLoadPrompt}
                  disabled={isLoadingPrompt || !campaignId || !accountId}
                  className="gap-2"
                >
                  {isLoadingPrompt ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : promptLoaded ? (
                    <RotateCcw className="h-4 w-4" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  {promptLoaded ? "Reload" : "Load Prompt"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!promptLoaded ? (
              /* Empty State - Prompt Not Loaded */
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <Brain className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="font-medium text-lg mb-1">No Prompt Loaded</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  {!campaignId || !accountId
                    ? "Select a campaign and account from the sidebar to load the AI prompt"
                    : "Click 'Load Prompt' above to fetch the assembled AI instructions for this context"
                  }
                </p>
                {campaignId && accountId && (
                  <Button onClick={handleLoadPrompt} disabled={isLoadingPrompt} className="gap-2">
                    {isLoadingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Load Prompt Now
                  </Button>
                )}
              </div>
            ) : (
              /* Prompt Loaded - Editable View */
              <div className="divide-y">
                {/* First Message Section */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-green-600" />
                      Opening Message
                      <Badge variant="outline" className="text-xs font-normal">What the AI says first</Badge>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {customFirstMessage.length} chars
                    </span>
                  </div>
                  <Textarea
                    value={customFirstMessage}
                    onChange={(e) => setCustomFirstMessage(e.target.value)}
                    placeholder="Hello, this is..."
                    className="min-h-[80px] text-sm bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900 focus:border-green-400"
                  />
                </div>

                {/* System Prompt Section */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Brain className="h-4 w-4 text-indigo-600" />
                      System Prompt
                      <Badge variant="outline" className="text-xs font-normal">AI behavior instructions</Badge>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {customSystemPrompt.length} chars (~{Math.ceil(customSystemPrompt.length / 4)} tokens)
                    </span>
                  </div>
                  <Textarea
                    value={customSystemPrompt}
                    onChange={(e) => setCustomSystemPrompt(e.target.value)}
                    placeholder="You are a helpful AI agent..."
                    className="min-h-[200px] font-mono text-xs leading-relaxed bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900 focus:border-indigo-400"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This is the full prompt assembled from campaign settings, account intelligence, and agent configuration.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Voice & Advanced Settings Row */}
      {callStatus === 'idle' && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Voice Provider Card */}
          <Card className="border">
            <CardContent className="p-4">
              <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                Voice Provider
              </Label>
              <Select
                value={voiceProvider}
                onValueChange={(value: "openai" | "google") => setVoiceProvider(value)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">
                    <span>OpenAI Realtime</span>
                    <Badge variant="outline" className="ml-2 text-xs">Recommended</Badge>
                  </SelectItem>
                  <SelectItem value="google">
                    <span>Google Gemini</span>
                    <Badge variant="secondary" className="ml-2 text-xs">Faster</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {voiceProvider === 'openai' ? "Natural conversation with low latency" : "Faster responses, cost-effective"}
              </p>
            </CardContent>
          </Card>

          {/* OpenAI Config Card (Only for OpenAI) */}
          {voiceProvider === 'openai' && (
            <Card className="border">
              <CardContent className="p-4">
                <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Realtime Settings
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Turn Detection</Label>
                    <Select value={turnDetection} onValueChange={setTurnDetection}>
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TURN_DETECTION_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Eagerness</Label>
                    <Select value={eagerness} onValueChange={setEagerness}>
                      <SelectTrigger className="h-8 text-xs mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EAGERNESS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Tokens</Label>
                    <Input
                      type="number"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(Number(e.target.value) || 4096)}
                      min={256}
                      max={16384}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Active Call Info */}
      {activeSession && callStatus !== 'idle' && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Phone</span>
                <p className="font-medium">{activeSession.phoneNumber}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Campaign</span>
                <p className="font-medium">{activeSession.campaignName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Agent</span>
                <p className="font-medium">{activeSession.agentName || 'AI Agent'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Provider</span>
                <p className="font-medium capitalize">{activeSession.voiceProvider}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript & Analysis */}
      {transcripts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Transcript */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Live Transcript
              </CardTitle>
              <CardDescription>
                Real-time conversation log
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4" ref={(el) => {
                  // Get the viewport element (parent of our div)
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
                        "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
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

          {/* Call Metrics */}
          <Card>
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
                  <Badge variant={callStatus === 'in_progress' ? 'default' : 'secondary'}>
                    {callStatus}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <span className="font-medium capitalize">{voiceProvider}</span>
                </div>
              </div>

              {callStatus === 'completed' && (
                <div className="pt-4 border-t space-y-3">
                  <h4 className="font-medium text-sm">Analysis</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Call completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                      <span>{transcripts.filter(t => t.role !== 'system').length} messages recorded</span>
                    </div>
                    {onAnalysisReady && transcripts.filter(t => t.role !== 'system').length >= 2 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
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
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Help Tip */}
      {callStatus === 'idle' && mode === 'phone' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1 mb-8">
          <Info className="h-4 w-4 shrink-0" />
          <span>Enter your number, review settings, and click Start Call to begin the simulation.</span>
        </div>
      )}

        </TabsContent>
      </Tabs>

      {/* Sticky Action Footer - Only show for phone mode */}
      {mode === 'phone' && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-6 pointer-events-none">
        <div className="pointer-events-auto shadow-2xl rounded-full p-2 bg-background/80 backdrop-blur-xl border flex items-center gap-2 justify-between ring-1 ring-black/5 dark:ring-white/10">
            <div className="pl-4 pr-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block">Status</span>
                <div className="flex items-center gap-1.5">
                   <div className={cn("w-2 h-2 rounded-full",
                      callStatus === 'idle' ? "bg-slate-300" :
                      callStatus === 'in_progress' ? "bg-green-500 animate-pulse" :
                      callStatus === 'ringing' ? "bg-yellow-500 animate-pulse" :
                      "bg-red-500"
                   )} />
                   <span className="font-semibold text-sm">
                      {callStatus === 'idle' ? 'Ready' : 
                       callStatus === 'in_progress' ? 'Live' : 
                       callStatus === 'ringing' ? 'Calling...' : 'Active'}
                   </span>
                </div>
            </div>
            
            {callStatus === 'idle' ? (
                <Button 
                   size="lg" 
                   onClick={handleStartPhoneTest}
                   disabled={!canStartCall || phoneTestMutation.isPending}
                   className="rounded-full h-12 px-8 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90 shadow-lg shadow-indigo-500/20 text-white"
                >
                   {phoneTestMutation.isPending ? (
                     <Loader2 className="h-5 w-5 animate-spin mr-2" />
                   ) : (
                     <PhoneOutgoing className="h-5 w-5 mr-2" />
                   )}
                   Start Call
                </Button>
            ) : (
                <Button
                   size="lg"
                   variant="destructive"
                   onClick={handleEndCall}
                   disabled={hangupMutation.isPending}
                   className="rounded-full h-12 px-8 shadow-lg shadow-red-500/20"
                >
                   {hangupMutation.isPending ? (
                     <Loader2 className="h-5 w-5 animate-spin mr-2" />
                   ) : (
                     <PhoneOff className="h-5 w-5 mr-2" />
                   )}
                   {hangupMutation.isPending ? "Ending..." : "End Call"}
                </Button>
            )}
        </div>
      </div>
      )}
    </div>
  );
}
