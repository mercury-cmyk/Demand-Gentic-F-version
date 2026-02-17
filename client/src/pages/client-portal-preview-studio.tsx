/**
 * Client Portal Preview Studio Page
 * Allows client users to test voice and email experiences for their campaigns.
 * Uses client portal API endpoints for authentication.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneOutgoing,
  Mail,
  Mic,
  MicOff,
  Volume2,
  Play,
  Square,
  RefreshCw,
  Sparkles,
  Building2,
  User,
  ChevronRight,
  Settings2,
  Wand2,
  Eye,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Radio,
  Zap,
  MessageSquare,
  Loader2,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Target,
  Send,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Email type options
const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch email' },
  { value: 'follow_up', label: 'Follow Up', description: 'Post-call follow up' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Schedule a meeting' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content' },
  { value: 'breakup', label: 'Breakup', description: 'Final attempt' },
] as const;

// Types
interface VoiceOption {
  id: string;
  name: string;
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  personality: string;
}

interface Account {
  id: string;
  name: string;
  domain?: string | null;
}

interface Contact {
  id: string;
  fullName: string | null;
  jobTitle: string | null;
  email: string | null;
}

interface Campaign {
  id: string;
  name: string;
}

interface PhonePostCallResult {
  finalDisposition?: string | null;
  postCallAnalysis?: {
    generatedAt?: string;
    transcriptTurnCount?: number;
    transcriptAvailable?: boolean;
    summary?: string;
    conversationQuality?: {
      overallScore?: number;
      summary?: string;
    } | null;
  } | null;
}

// Voice options - All 24 Gemini voices
const GEMINI_VOICES: VoiceOption[] = [
  // Primary B2B Sales voices
  { id: 'Kore', name: 'Kore', displayName: 'Kore', gender: 'female', personality: 'Firm, Professional, Confident' },
  { id: 'Fenrir', name: 'Fenrir', displayName: 'Fenrir', gender: 'male', personality: 'Excitable, Energetic, Persuasive' },
  { id: 'Charon', name: 'Charon', displayName: 'Charon', gender: 'male', personality: 'Informative, Authoritative, Knowledgeable' },
  { id: 'Aoede', name: 'Aoede', displayName: 'Aoede', gender: 'female', personality: 'Breezy, Friendly, Light' },
  { id: 'Puck', name: 'Puck', displayName: 'Puck', gender: 'male', personality: 'Upbeat, Lively, Engaging' },
  // Professional voices
  { id: 'Zephyr', name: 'Zephyr', displayName: 'Zephyr', gender: 'male', personality: 'Bright, Clear, Articulate' },
  { id: 'Leda', name: 'Leda', displayName: 'Leda', gender: 'female', personality: 'Youthful, Fresh, Modern' },
  { id: 'Orus', name: 'Orus', displayName: 'Orus', gender: 'male', personality: 'Firm, Steady, Reliable' },
  { id: 'Sulafat', name: 'Sulafat', displayName: 'Sulafat', gender: 'female', personality: 'Warm, Caring, Empathetic' },
  { id: 'Gacrux', name: 'Gacrux', displayName: 'Gacrux', gender: 'male', personality: 'Mature, Experienced, Credible' },
  { id: 'Schedar', name: 'Schedar', displayName: 'Schedar', gender: 'male', personality: 'Even, Balanced, Composed' },
  { id: 'Achird', name: 'Achird', displayName: 'Achird', gender: 'female', personality: 'Friendly, Welcoming, Warm' },
  // Specialized voices
  { id: 'Sadaltager', name: 'Sadaltager', displayName: 'Sadaltager', gender: 'male', personality: 'Knowledgeable, Expert, Authoritative' },
  { id: 'Pulcherrima', name: 'Pulcherrima', displayName: 'Pulcherrima', gender: 'female', personality: 'Forward, Confident, Assertive' },
  { id: 'Iapetus', name: 'Iapetus', displayName: 'Iapetus', gender: 'male', personality: 'Clear, Precise, Technical' },
  { id: 'Erinome', name: 'Erinome', displayName: 'Erinome', gender: 'female', personality: 'Clear, Articulate, Professional' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', displayName: 'Vindemiatrix', gender: 'female', personality: 'Gentle, Soft, Calming' },
  { id: 'Achernar', name: 'Achernar', displayName: 'Achernar', gender: 'female', personality: 'Soft, Reassuring, Kind' },
  // Dynamic voices
  { id: 'Sadachbia', name: 'Sadachbia', displayName: 'Sadachbia', gender: 'female', personality: 'Lively, Dynamic, Exciting' },
  { id: 'Laomedeia', name: 'Laomedeia', displayName: 'Laomedeia', gender: 'female', personality: 'Upbeat, Positive, Motivating' },
  // Character voices
  { id: 'Enceladus', name: 'Enceladus', displayName: 'Enceladus', gender: 'male', personality: 'Breathy, Intimate, Thoughtful' },
  { id: 'Algenib', name: 'Algenib', displayName: 'Algenib', gender: 'male', personality: 'Gravelly, Deep, Distinctive' },
  { id: 'Rasalgethi', name: 'Rasalgethi', displayName: 'Rasalgethi', gender: 'male', personality: 'Informative, Educational, Clear' },
  { id: 'Alnilam', name: 'Alnilam', displayName: 'Alnilam', gender: 'male', personality: 'Firm, Decisive, Commanding' },
];

const VOICE_TONES = [
  { value: 'professional', label: 'Professional', description: 'Formal and business-focused' },
  { value: 'consultative', label: 'Consultative', description: 'Advisory and helpful' },
  { value: 'confident', label: 'Confident', description: 'Direct and assertive' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'empathetic', label: 'Empathetic', description: 'Understanding and supportive' },
];

// Client portal auth headers helper
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('clientPortalToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ClientPortalPreviewStudioPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const campaignIdFromUrl = urlParams.get('campaignId');
  const modeFromUrl = urlParams.get('mode');
  const { toast } = useToast();

  // Context selection
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Preview mode
  const [previewMode, setPreviewMode] = useState<'voice' | 'email' | 'phone'>('voice');

  // Voice settings
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [voiceTone, setVoiceTone] = useState<string>('professional');
  const [voiceSimStatus, setVoiceSimStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<Array<{ role: string; content: string; timestamp: Date }>>([]);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');

  // Email settings
  const [emailType, setEmailType] = useState<string>('cold_outreach');
  const [emailHtml, setEmailHtml] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailGenerating, setEmailGenerating] = useState(false);

  // Phone test call state
  const [testPhoneNumber, setTestPhoneNumber] = useState<string>('');
  const [phoneCallStatus, setPhoneCallStatus] = useState<'idle' | 'initiating' | 'ringing' | 'active' | 'completed' | 'error'>('idle');
  const [phoneSessionId, setPhoneSessionId] = useState<string | null>(null);
  const [phoneCallInfo, setPhoneCallInfo] = useState<{
    campaignName?: string;
    voiceProvider?: string;
    phoneNumber?: string;
    testCallId?: string;
  } | null>(null);
  const [phoneCallError, setPhoneCallError] = useState<string | null>(null);
  const [phonePostCall, setPhonePostCall] = useState<PhonePostCallResult | null>(null);

  // Voice preview state
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // Refs
  const playPreviewRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Update from URL
  useEffect(() => {
    if (campaignIdFromUrl && campaignIdFromUrl !== selectedCampaignId) {
      setSelectedCampaignId(campaignIdFromUrl);
    }
  }, [campaignIdFromUrl, selectedCampaignId]);

  useEffect(() => {
    if (modeFromUrl === 'email' || modeFromUrl === 'voice' || modeFromUrl === 'phone') {
      setPreviewMode(modeFromUrl);
    }
  }, [modeFromUrl]);

  // Fetch campaigns using CLIENT PORTAL endpoint
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/client-portal/campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Fetch preview audience (accounts and contacts) for selected campaign
  const { data: audienceData, isLoading: audienceLoading } = useQuery<{
    accounts: Array<{ id: string; name: string; website?: string | null; industry?: string | null }>;
    contacts: Array<{ id: string; firstName?: string; lastName?: string; email?: string; phone?: string; title?: string; company?: string }>;
  }>({
    queryKey: ['/api/client-portal/campaigns', selectedCampaignId, 'preview-audience'],
    queryFn: async () => {
      if (!selectedCampaignId) return { accounts: [], contacts: [] };
      console.log('[PREVIEW STUDIO] Fetching preview-audience for campaign:', selectedCampaignId);
      const res = await fetch(`/api/client-portal/campaigns/${selectedCampaignId}/preview-audience`, {
        headers: getAuthHeaders(),
      });
      console.log('[PREVIEW STUDIO] preview-audience HTTP status:', res.status);
      if (!res.ok) {
        const errText = await res.text();
        console.error('[PREVIEW STUDIO] preview-audience error:', res.status, errText);
        throw new Error('Failed to fetch preview audience');
      }
      const data = await res.json();
      console.log('[PREVIEW STUDIO] preview-audience response:', JSON.stringify({ accounts: data.accounts?.length, contacts: data.contacts?.length, campaign: data.campaign }));
      return data;
    },
    enabled: !!selectedCampaignId,
    retry: false,
  });

  // Intelligence status check
  const { data: intelligenceStatus, isLoading: intelligenceLoading } = useQuery<{
    ready: boolean;
    accountIntelligence: { available: boolean; confidence?: number };
    organizationIntelligence: { available: boolean };
    solutionMapping: { available: boolean };
    missingComponents: string[];
    message: string;
  }>({
    queryKey: ['/api/client-portal/simulation/intelligence-status', selectedCampaignId, selectedAccountId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaignId) params.set('campaignId', selectedCampaignId);
      if (selectedAccountId) params.set('accountId', selectedAccountId);
      const res = await fetch(`/api/client-portal/simulation/intelligence-status?${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to check intelligence status');
      return res.json();
    },
    enabled: !!(selectedCampaignId && selectedAccountId),
    staleTime: 30000,
  });

  const intelligenceReady = intelligenceStatus?.ready ?? false;

  // Intelligence generation mutation
  const queryClient = useQueryClient();
  const [intelligenceAutoTriggered, setIntelligenceAutoTriggered] = useState<string | null>(null);
  const [intelligencePhase, setIntelligencePhase] = useState<'idle' | 'researching' | 'complete'>('idle');

  const generateIntelligenceMutation = useMutation({
    mutationFn: async () => {
      setIntelligencePhase('researching');
      const res = await fetch('/api/client-portal/simulation/intelligence-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ campaignId: selectedCampaignId, accountId: selectedAccountId }),
      });
      if (!res.ok) throw new Error('Failed to generate intelligence');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/simulation/intelligence-status'] });
      if (data.success) {
        setIntelligencePhase('complete');
        toast({ title: 'Intelligence Ready', description: 'All components researched. You can now start the preview.' });
      } else {
        setIntelligencePhase('idle');
        const missing = data.status?.missingComponents?.join(', ') || 'some components';
        toast({ variant: 'destructive', title: 'Partial Generation', description: `Still missing: ${missing}` });
      }
    },
    onError: (error: Error) => {
      setIntelligencePhase('idle');
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    },
  });

  // Auto-trigger intelligence generation when missing and context is selected
  const autoTriggerKey = `${selectedCampaignId}-${selectedAccountId}`;
  useEffect(() => {
    if (
      intelligenceStatus &&
      !intelligenceStatus.ready &&
      !generateIntelligenceMutation.isPending &&
      selectedCampaignId &&
      selectedAccountId &&
      intelligenceAutoTriggered !== autoTriggerKey
    ) {
      setIntelligenceAutoTriggered(autoTriggerKey);
      generateIntelligenceMutation.mutate();
    }
  }, [intelligenceStatus, selectedCampaignId, selectedAccountId, autoTriggerKey, intelligenceAutoTriggered]);

  // Reset phase when intelligence becomes ready from cache
  useEffect(() => {
    if (intelligenceReady && intelligencePhase !== 'complete') {
      setIntelligencePhase('complete');
    }
  }, [intelligenceReady]);

  // Reset when campaign/account changes
  useEffect(() => {
    setIntelligencePhase('idle');
  }, [selectedCampaignId, selectedAccountId]);

  // Transform accounts data
  const accounts: Account[] = (audienceData?.accounts || []).map(a => ({
    id: a.id,
    name: a.name,
    domain: a.website,
  }));
  const accountsLoading = audienceLoading;

  // Transform and filter contacts by selected account
  const allContacts = (audienceData?.contacts || []).map(c => ({
    id: c.id,
    fullName: c.firstName && c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName || c.lastName || null,
    jobTitle: c.title || null,
    email: c.email || null,
    company: c.company,
  }));

  // Filter contacts by selected account's company name
  const selectedAccountName = accounts.find(a => a.id === selectedAccountId)?.name;
  const contacts: Contact[] = selectedAccountId
    ? allContacts.filter(c => c.company === selectedAccountName)
    : [];
  const contactsLoading = audienceLoading;

  // Get selected entities
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const selectedContact = contacts.find(c => c.id === selectedContactId);
  const selectedVoiceInfo = GEMINI_VOICES.find(v => v.id === selectedVoice);

  // Handle voice preview - accepts optional voiceId to preview a specific voice
  const handlePreviewVoice = async (voiceId?: string) => {
    const targetVoiceId = voiceId || selectedVoice;
    try {
      if (playPreviewRef.current) {
        playPreviewRef.current.pause();
        playPreviewRef.current = null;
      }
      setPreviewingVoiceId(targetVoiceId);
      const response = await fetch('/api/voice-providers/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          voiceId: targetVoiceId,
          provider: 'gemini',
        }),
      });
      if (!response.ok) throw new Error('Failed to generate preview');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setPreviewingVoiceId(null);
      };
      playPreviewRef.current = audio;
      await audio.play();
    } catch (error) {
      setPreviewingVoiceId(null);
      toast({ variant: 'destructive', title: 'Preview Failed', description: 'Could not play voice preview' });
    }
  };

  // ── Voice Simulation: Start ──
  const startSimulationMutation = useMutation({
    mutationFn: async () => {
      const contactPayload: Record<string, string> = {};
      if (selectedContact) {
        const parts = (selectedContact.fullName || '').split(' ');
        contactPayload.contactName = selectedContact.fullName || '';
        contactPayload.contactFirstName = parts[0] || '';
        contactPayload.contactLastName = parts.slice(1).join(' ') || '';
        contactPayload.contactTitle = selectedContact.jobTitle || '';
      }
      if (selectedAccount) {
        contactPayload.accountName = selectedAccount.name;
      }
      const res = await fetch('/api/client-portal/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          voiceId: selectedVoice,
          contactData: Object.keys(contactPayload).length > 0 ? contactPayload : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start' }));
        throw new Error(err.error || 'Failed to start simulation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setVoiceSessionId(data.sessionId);
      setVoiceSimStatus('active');
      setVoiceTranscripts([{
        role: 'assistant',
        content: data.firstMessage,
        timestamp: new Date(),
      }]);
      toast({ title: 'Simulation Started', description: `Agent: ${data.context?.agentName || 'AI Agent'}` });
    },
    onError: (error: Error) => {
      setVoiceSimStatus('idle');
      toast({ variant: 'destructive', title: 'Start Failed', description: error.message });
    },
  });

  // ── Voice Simulation: Chat ──
  const sendChatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await fetch('/api/client-portal/simulation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          sessionId: voiceSessionId,
          campaignId: selectedCampaignId,
          userMessage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to send' }));
        throw new Error(err.error || 'Failed to send message');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (!voiceSessionId && data.sessionId) setVoiceSessionId(data.sessionId);
      setVoiceTranscripts(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }]);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Chat Error', description: error.message });
    },
  });

  const handleSendMessage = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || sendChatMutation.isPending) return;
    setVoiceTranscripts(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
    setChatInput('');
    sendChatMutation.mutate(msg);
  }, [chatInput, sendChatMutation]);

  const handleStartSimulation = useCallback(() => {
    setVoiceSimStatus('connecting');
    setVoiceTranscripts([]);
    setVoiceSessionId(null);
    startSimulationMutation.mutate();
  }, [startSimulationMutation]);

  const handleEndSimulation = useCallback(() => {
    setVoiceSimStatus('idle');
    setVoiceSessionId(null);
  }, []);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [voiceTranscripts]);

  // ── Email Generation ──
  const handleGenerateEmail = useCallback(async () => {
    if (!selectedCampaignId) return;
    setEmailGenerating(true);
    setEmailHtml(null);
    try {
      const res = await fetch('/api/client-portal/simulation/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          accountId: selectedAccountId,
          contactId: selectedContactId,
          emailType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to generate email');
      }
      const data = await res.json();
      setEmailHtml(data.html);
      setEmailSubject(data.subject || '');
      toast({ title: 'Email Generated', description: `Subject: ${data.subject}` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Email Generation Failed', description: error.message });
    } finally {
      setEmailGenerating(false);
    }
  }, [selectedCampaignId, selectedAccountId, selectedContactId, emailType, toast]);

  const sendTestEmailMutation = useMutation({
    mutationFn: async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
      const res = await fetch('/api/client-portal/agentic/emails/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ to, subject, html }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to send test email');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Email Sent', description: 'Test email successfully sent.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Send Failed', description: error.message });
    },
  });

  // ── Phone Test Call: Start ──
  const startPhoneTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/client-portal/simulation/phone-test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          accountId: selectedAccountId,
          contactId: selectedContactId,
          testPhoneNumber: testPhoneNumber.trim(),
          voiceProvider: 'google',
          voice: selectedVoice,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start phone test' }));
        throw new Error(err.error || 'Failed to start phone test');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPhoneSessionId(data.sessionId);
      setPhoneCallStatus('ringing');
      setPhoneCallError(null);
      setPhonePostCall(null);
      setPhoneCallInfo({
        campaignName: data.campaignName,
        voiceProvider: data.voiceProvider,
        phoneNumber: data.phoneNumber,
        testCallId: data.testCallId,
      });
      toast({ title: 'Call Initiated', description: `Your phone (${data.phoneNumber}) will ring shortly.` });
      // Start polling for call status
      startPhoneStatusPolling(data.sessionId);
    },
    onError: (error: Error) => {
      setPhoneCallStatus('error');
      setPhoneCallError(error.message);
      toast({ variant: 'destructive', title: 'Phone Test Failed', description: error.message });
    },
  });

  // ── Phone Test Call: Hangup ──
  const hangupPhoneTestMutation = useMutation({
    mutationFn: async () => {
      if (!phoneSessionId) throw new Error('No active session');
      const res = await fetch(`/api/client-portal/simulation/phone-test/${phoneSessionId}/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to hang up' }));
        throw new Error(err.error || 'Failed to hang up');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPhoneCallStatus('completed');
      if (data?.finalDisposition || data?.postCallAnalysis) {
        setPhonePostCall({
          finalDisposition: data.finalDisposition,
          postCallAnalysis: data.postCallAnalysis,
        });
      }
      toast({ title: 'Call Ended', description: 'Phone test call has ended.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Hangup Failed', description: error.message });
    },
  });

  // Poll for phone test status
  const phonePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPhoneStatusPolling = useCallback((sessionId: string) => {
    // Clean up existing polling
    if (phonePollingRef.current) clearInterval(phonePollingRef.current);

    phonePollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/client-portal/simulation/phone-test/${sessionId}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        const status = data.session?.status;
        if (data.finalDisposition || data.postCallAnalysis) {
          setPhonePostCall({
            finalDisposition: data.finalDisposition,
            postCallAnalysis: data.postCallAnalysis,
          });
        }
        if (status === 'completed' || status === 'error') {
          setPhoneCallStatus(status === 'error' ? 'error' : 'completed');
          if (phonePollingRef.current) {
            clearInterval(phonePollingRef.current);
            phonePollingRef.current = null;
          }
        } else if (status === 'active') {
          setPhoneCallStatus('active');
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (phonePollingRef.current) clearInterval(phonePollingRef.current);
    };
  }, []);

  const handleStartPhoneTest = useCallback(() => {
    if (!testPhoneNumber.trim() || testPhoneNumber.trim().length < 10) {
      toast({ variant: 'destructive', title: 'Invalid Phone Number', description: 'Please enter a valid phone number (at least 10 digits).' });
      return;
    }
    setPhoneCallStatus('initiating');
    setPhoneCallError(null);
    setPhoneCallInfo(null);
    startPhoneTestMutation.mutate();
  }, [testPhoneNumber, startPhoneTestMutation, toast]);

  const handleHangupPhoneTest = useCallback(() => {
    hangupPhoneTestMutation.mutate();
  }, [hangupPhoneTestMutation]);

  const handleResetPhoneTest = useCallback(() => {
    setPhoneCallStatus('idle');
    setPhoneSessionId(null);
    setPhoneCallInfo(null);
    setPhoneCallError(null);
    setPhonePostCall(null);
    if (phonePollingRef.current) {
      clearInterval(phonePollingRef.current);
      phonePollingRef.current = null;
    }
  }, []);

  const hasBasicContext = !!(selectedCampaignId && selectedAccountId);
  const hasRequiredContext = hasBasicContext && intelligenceReady;

  return (
    <ClientPortalLayout>
      <div className="min-h-screen bg-[#0a0a0f]">
        {/* Gradient Background Effects */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        </div>

        {/* Header */}
        <div className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Preview Studio</h1>
                  <p className="text-xs text-white/50">Test voice & email experiences</p>
                </div>
              </div>

              {/* Voice / Email / Phone Mode Toggle */}
              <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => setPreviewMode('voice')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'voice'
                      ? "bg-purple-500/30 text-purple-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chat Sim
                </button>
                <button
                  onClick={() => setPreviewMode('phone')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'phone'
                      ? "bg-green-500/30 text-green-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  <Phone className="h-3.5 w-3.5" />
                  Phone Test
                </button>
                <button
                  onClick={() => setPreviewMode('email')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'email'
                      ? "bg-blue-500/30 text-blue-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex h-[calc(100vh-200px)]">
          {/* Left Panel - Context & Intelligence */}
          <div className="w-80 border-r border-white/5 bg-black/20 backdrop-blur-xl flex flex-col shrink-0">
            <div className="p-3 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-purple-400" />
                Context & Intelligence
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Campaign */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Campaign</Label>
                <Select value={selectedCampaignId ?? undefined} onValueChange={(v) => { setSelectedCampaignId(v); setSelectedAccountId(null); setSelectedContactId(null); }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={campaignsLoading ? "Loading..." : "Select campaign"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-60">
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-white focus:bg-white/10 focus:text-white">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Account */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Account</Label>
                <Select
                  value={selectedAccountId ?? undefined}
                  onValueChange={(v) => { setSelectedAccountId(v); setSelectedContactId(null); }}
                  disabled={!selectedCampaignId}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={accountsLoading ? "Loading..." : "Select account"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-60">
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id} className="text-white focus:bg-white/10 focus:text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-white/40" />
                          {a.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Contact <span className="text-white/30">(Optional)</span>
                </Label>
                <Select
                  value={selectedContactId ?? undefined}
                  onValueChange={setSelectedContactId}
                  disabled={!selectedAccountId}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={contactsLoading ? "Loading..." : "Select contact"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-60">
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-white focus:bg-white/10 focus:text-white">
                        <div className="flex flex-col">
                          <span>{c.fullName || c.email}</span>
                          {c.jobTitle && <span className="text-xs text-white/40">{c.jobTitle}</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>

            {/* Intelligence Research Steps — expanded panel */}
            {hasBasicContext && (
              <div className="border-t border-white/5 flex-shrink-0">
                {intelligenceLoading ? (
                  <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <div className="flex items-center gap-2 text-blue-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking intelligence...</span>
                    </div>
                  </div>
                ) : (() => {
                  const isResearching = generateIntelligenceMutation.isPending || intelligencePhase === 'researching';
                  const acctDone = intelligenceStatus?.accountIntelligence?.available || (intelligenceReady);
                  const orgDone = intelligenceStatus?.organizationIntelligence?.available || (intelligenceReady);
                  const solnDone = intelligenceStatus?.solutionMapping?.available || (intelligenceReady);
                  const allDone = acctDone && orgDone && solnDone;

                  const stepItems = [
                    { key: 'acct', label: 'Account Intelligence', description: 'Prospect company research', icon: Brain, done: acctDone, confidence: intelligenceStatus?.accountIntelligence?.confidence },
                    { key: 'org', label: 'Organization Intelligence', description: 'Your company profile', icon: Building2, done: orgDone },
                    { key: 'soln', label: 'Solution Mapping', description: 'Product-problem alignment', icon: Target, done: solnDone },
                  ];

                  return (
                    <div className={cn(
                      "p-4 transition-colors duration-500",
                      allDone
                        ? "bg-gradient-to-r from-green-500/10 to-emerald-500/10"
                        : isResearching
                          ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10"
                          : "bg-gradient-to-r from-amber-500/10 to-orange-500/10"
                    )}>
                      {/* Header */}
                      <div className="flex items-center gap-2 text-sm mb-4">
                        {allDone ? (
                          <><ShieldCheck className="h-4 w-4 text-green-400" /><span className="text-green-400 font-medium">Ready to Preview</span></>
                        ) : isResearching ? (
                          <><Loader2 className="h-4 w-4 text-blue-400 animate-spin" /><span className="text-blue-400 font-medium">Researching Intelligence...</span></>
                        ) : (
                          <><ShieldAlert className="h-4 w-4 text-amber-400" /><span className="text-amber-400 font-medium">Preparing Intelligence</span></>
                        )}
                      </div>

                      {/* Steps — spacious vertical layout */}
                      <div className="space-y-2.5">
                        {stepItems.map((step) => {
                          const Icon = step.icon;
                          const showSpinner = isResearching && !step.done;
                          return (
                            <div key={step.key} className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-500",
                              step.done ? "bg-green-500/10 border border-green-500/20" : showSpinner ? "bg-blue-500/5 border border-blue-500/15" : "bg-white/5 border border-white/5"
                            )}>
                              {/* Status indicator */}
                              <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                {step.done ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-400 animate-in zoom-in-50 duration-300" />
                                ) : showSpinner ? (
                                  <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-white/20" />
                                )}
                              </div>
                              {/* Icon + label + description */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", step.done ? "text-green-400/70" : showSpinner ? "text-blue-400/70" : "text-white/30")} />
                                  <span className={cn(
                                    "text-xs font-medium transition-colors duration-300",
                                    step.done ? "text-green-400/90" : showSpinner ? "text-blue-400/80" : "text-white/50"
                                  )}>
                                    {step.label}
                                    {step.done && step.confidence ? ` (${Math.round(step.confidence * 100)}%)` : ''}
                                  </span>
                                </div>
                                <p className={cn(
                                  "text-[10px] mt-0.5 ml-5.5",
                                  step.done ? "text-green-400/50" : showSpinner ? "text-blue-400/50" : "text-white/25"
                                )}>{step.description}</p>
                              </div>
                              {/* Status badge */}
                              <span className={cn(
                                "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md shrink-0",
                                step.done ? "text-green-400 bg-green-500/15" : showSpinner ? "text-blue-400 bg-blue-500/15" : "text-white/25 bg-white/5"
                              )}>
                                {step.done ? 'Done' : showSpinner ? 'Researching' : 'Pending'}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer message */}
                      {allDone ? (
                        <p className="text-xs text-green-400/70 mt-3 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3" />
                          All intelligence ready — start the preview.
                        </p>
                      ) : isResearching ? (
                        <p className="text-xs text-blue-400/60 mt-3">
                          Analyzing {selectedAccount?.name || 'account'} and mapping solutions...
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-3 h-8 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                          onClick={() => generateIntelligenceMutation.mutate()}
                          disabled={generateIntelligenceMutation.isPending}
                        >
                          <Wand2 className="h-3 w-3 mr-1.5" />Generate Intelligence
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Main Preview Area */}
          <div className="flex-1 overflow-hidden">
            {previewMode === 'voice' ? (
              <VoicePreviewSection
                hasContext={hasRequiredContext}
                selectedVoice={selectedVoice}
                setSelectedVoice={setSelectedVoice}
                voiceTone={voiceTone}
                setVoiceTone={setVoiceTone}
                selectedVoiceInfo={selectedVoiceInfo}
                onPreviewVoice={handlePreviewVoice}
                previewingVoiceId={previewingVoiceId}
                voiceSimStatus={voiceSimStatus}
                onStartSimulation={handleStartSimulation}
                onEndSimulation={handleEndSimulation}
                isStarting={startSimulationMutation.isPending}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                voiceTranscripts={voiceTranscripts}
                chatInput={chatInput}
                setChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                isSending={sendChatMutation.isPending}
                transcriptEndRef={transcriptEndRef}
              />
            ) : previewMode === 'phone' ? (
              <PhoneTestSection
                hasContext={hasRequiredContext}
                testPhoneNumber={testPhoneNumber}
                setTestPhoneNumber={setTestPhoneNumber}
                phoneCallStatus={phoneCallStatus}
                phoneCallInfo={phoneCallInfo}
                phoneCallError={phoneCallError}
                phonePostCall={phonePostCall}
                onStartPhoneTest={handleStartPhoneTest}
                onHangup={handleHangupPhoneTest}
                onReset={handleResetPhoneTest}
                isStarting={startPhoneTestMutation.isPending}
                isHangingUp={hangupPhoneTestMutation.isPending}
                selectedVoice={selectedVoice}
                setSelectedVoice={setSelectedVoice}
                selectedVoiceInfo={selectedVoiceInfo}
              />
            ) : (
              <EmailPreviewSection
                hasContext={hasRequiredContext}
                emailType={emailType}
                setEmailType={setEmailType}
                emailHtml={emailHtml}
                emailSubject={emailSubject}
                emailGenerating={emailGenerating}
                onGenerateEmail={handleGenerateEmail}
                selectedAccount={selectedAccount}
                selectedContact={selectedContact}
                onSendTest={async (to) => {
                  if (!emailHtml) return;
                  await sendTestEmailMutation.mutateAsync({
                    to,
                    subject: emailSubject || 'Test Email',
                    html: emailHtml
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </ClientPortalLayout>
  );
}

// Voice Preview Section Component
interface VoicePreviewSectionProps {
  hasContext: boolean;
  selectedVoice: string;
  setSelectedVoice: (v: string) => void;
  voiceTone: string;
  setVoiceTone: (v: string) => void;
  selectedVoiceInfo: VoiceOption | undefined;
  onPreviewVoice: (voiceId?: string) => void;
  previewingVoiceId: string | null;
  voiceSimStatus: 'idle' | 'connecting' | 'active' | 'completed';
  onStartSimulation: () => void;
  onEndSimulation: () => void;
  isStarting: boolean;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  voiceTranscripts: Array<{ role: string; content: string; timestamp: Date }>;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
}

function VoicePreviewSection({
  hasContext,
  selectedVoice,
  setSelectedVoice,
  voiceTone,
  setVoiceTone,
  selectedVoiceInfo,
  onPreviewVoice,
  previewingVoiceId,
  voiceSimStatus,
  onStartSimulation,
  onEndSimulation,
  isStarting,
  isMuted,
  setIsMuted,
  voiceTranscripts,
  chatInput,
  setChatInput,
  onSendMessage,
  isSending,
  transcriptEndRef,
}: VoicePreviewSectionProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Compact Voice Configuration Bar */}
      <div className="border-b border-white/5 bg-black/10 backdrop-blur-sm">
        <div className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Voice Select */}
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="h-4 w-4 text-purple-400 shrink-0" />
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider shrink-0">Voice</Label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-sm w-[180px]">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-72">
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Male Voices</div>
                  {GEMINI_VOICES.filter(v => v.gender === 'male').map(voice => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{voice.displayName}</span>
                        <span className="text-[10px] text-white/40">{voice.personality.split(',')[0]}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider border-t border-white/5 mt-1">Female Voices</div>
                  {GEMINI_VOICES.filter(v => v.gender === 'female').map(voice => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{voice.displayName}</span>
                        <span className="text-[10px] text-white/40">{voice.personality.split(',')[0]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Preview button */}
              <button
                onClick={() => onPreviewVoice(selectedVoice)}
                disabled={previewingVoiceId === selectedVoice}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 border",
                  previewingVoiceId === selectedVoice
                    ? "bg-purple-500/30 border-purple-400/50"
                    : "bg-white/5 hover:bg-purple-500/20 border-white/10 hover:border-purple-400/50"
                )}
                title="Preview voice"
              >
                {previewingVoiceId === selectedVoice ? (
                  <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-purple-400 ml-0.5" />
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/10 shrink-0" />

            {/* Tone Select */}
            <div className="flex items-center gap-2 min-w-0">
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider shrink-0">Tone</Label>
              <Select value={voiceTone} onValueChange={setVoiceTone}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-sm w-[160px]">
                  <SelectValue placeholder="Select tone" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                  {VOICE_TONES.map(tone => (
                    <SelectItem key={tone.value} value={tone.value} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tone.label}</span>
                        <span className="text-[10px] text-white/40">{tone.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/10 shrink-0" />

            {/* Selected voice info badge */}
            {selectedVoiceInfo && (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-[10px] h-6">
                  {selectedVoiceInfo.displayName}
                </Badge>
                <span className="text-[10px] text-white/30">{selectedVoiceInfo.personality}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulation Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <Phone className="h-8 w-8 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Voice Preview</h2>
              <p className="text-white/50 mb-4">Select a campaign and account to start testing</p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign, Account & Intelligence required</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Call Status Bar */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
                    voiceSimStatus === 'active'
                      ? "bg-green-500 shadow-lg shadow-green-500/30"
                      : voiceSimStatus === 'connecting'
                        ? "bg-blue-500 animate-pulse"
                        : "bg-purple-500/20"
                  )}>
                    {voiceSimStatus === 'connecting' ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <PhoneCall className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      {voiceSimStatus === 'active' ? 'Call Active' : voiceSimStatus === 'connecting' ? 'Connecting...' : 'Ready to Call'}
                    </h3>
                    <p className="text-sm text-white/50">
                      {selectedVoiceInfo?.displayName} — {VOICE_TONES.find(t => t.value === voiceTone)?.label || voiceTone}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {voiceSimStatus === 'active' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsMuted(!isMuted)}
                      className={cn(isMuted ? "bg-red-500/20 border-red-500/50" : "bg-white/5")}
                    >
                      {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  )}
                  {voiceSimStatus === 'idle' ? (
                    <Button
                      onClick={onStartSimulation}
                      disabled={isStarting}
                      className="bg-purple-500 hover:bg-purple-600"
                    >
                      {isStarting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Phone className="h-4 w-4 mr-2" />
                      )}
                      {isStarting ? 'Starting...' : 'Start Test'}
                    </Button>
                  ) : voiceSimStatus === 'connecting' ? (
                    <Button disabled className="bg-blue-500/50">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </Button>
                  ) : (
                    <Button
                      onClick={onEndSimulation}
                      variant="destructive"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      End Call
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Transcript + Chat */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Transcript Area */}
              <ScrollArea className="flex-1 p-4">
                {voiceTranscripts.length === 0 ? (
                  <div className="h-full flex items-center justify-center min-h-[200px]">
                    <div className="text-center">
                      <MessageSquare className="h-8 w-8 text-white/20 mx-auto mb-2" />
                      <p className="text-white/40 text-sm">
                        Start a test to see the conversation
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {voiceTranscripts.map((msg, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex gap-3",
                          msg.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div className={cn(
                          "max-w-[75%] rounded-xl px-4 py-2.5",
                          msg.role === 'user'
                            ? "bg-purple-500/20 border border-purple-500/30 text-white"
                            : "bg-white/5 border border-white/10 text-white/90"
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider",
                              msg.role === 'user' ? "text-purple-400" : "text-blue-400"
                            )}>
                              {msg.role === 'user' ? 'You (Prospect)' : 'AI Agent'}
                            </span>
                            <span className="text-[9px] text-white/30">
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {isSending && (
                      <div className="flex justify-start">
                        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
                            <span className="text-xs text-white/50">AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Chat Input — only visible when call is active */}
              {voiceSimStatus === 'active' && (
                <div className="p-4 border-t border-white/5 bg-black/20">
                  <div className="flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          onSendMessage();
                        }
                      }}
                      placeholder="Type your response as the prospect..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none min-h-[44px] max-h-[120px]"
                      rows={1}
                      disabled={isSending}
                    />
                    <Button
                      onClick={onSendMessage}
                      disabled={!chatInput.trim() || isSending}
                      className="bg-purple-500 hover:bg-purple-600 shrink-0"
                      size="icon"
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/30 mt-1.5">Press Enter to send. You're playing the prospect receiving the call.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Email Preview Section Component
interface EmailPreviewSectionProps {
  hasContext: boolean;
  emailType: string;
  setEmailType: (v: string) => void;
  emailHtml: string | null;
  emailSubject: string;
  emailGenerating: boolean;
  onGenerateEmail: () => void;
  onSendTest?: (to: string) => Promise<void>;
  selectedAccount: Account | undefined;
  selectedContact: Contact | undefined;
}

function EmailPreviewSection({
  hasContext,
  emailType,
  setEmailType,
  emailHtml,
  emailSubject,
  emailGenerating,
  onGenerateEmail,
  onSendTest,
  selectedAccount,
  selectedContact,
}: EmailPreviewSectionProps) {
  const [copied, setCopied] = useState(false);
  const [testEmailOpen, setTestEmailOpen] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Initialize test email with contact email if available
  useEffect(() => {
    if (selectedContact?.email) {
      setTestEmailTo(selectedContact.email);
    }
  }, [selectedContact, testEmailOpen]);

  const handleCopyHtml = useCallback(() => {
    if (!emailHtml) return;
    navigator.clipboard.writeText(emailHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [emailHtml]);

  const handleSendTest = async () => {
    if (!onSendTest || !testEmailTo) return;
    setSendingTest(true);
    try {
      await onSendTest(testEmailTo);
      setTestEmailOpen(false);
    } catch (error) {
      // Error handling is done in parent
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Email Config Bar */}
      <div className="border-b border-white/5 bg-black/10 backdrop-blur-sm">
        <div className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 text-blue-400 shrink-0" />
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider shrink-0">Type</Label>
              <Select value={emailType} onValueChange={setEmailType}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-sm w-[200px]">
                  <SelectValue placeholder="Select email type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                  {EMAIL_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{type.label}</span>
                        <span className="text-[10px] text-white/40">{type.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-px h-6 bg-white/10 shrink-0" />

            {/* Target info */}
            {selectedAccount && (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-[10px] h-6">
                  <Building2 className="h-3 w-3 mr-1" />
                  {selectedAccount.name}
                </Badge>
                {selectedContact && (
                  <Badge variant="outline" className="border-white/20 text-white/60 text-[10px] h-6">
                    <User className="h-3 w-3 mr-1" />
                    {selectedContact.fullName}
                  </Badge>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {emailHtml && (
                <>
                  <Dialog open={testEmailOpen} onOpenChange={setTestEmailOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-white/10 text-white/60 hover:text-white"
                      >
                        <Send className="h-3 w-3 mr-1.5" />
                        Send Test
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Send Test Email</DialogTitle>
                        <DialogDescription>
                          Send this preview to yourself or a colleague.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Recipient Email</Label>
                          <Input
                            placeholder="name@example.com"
                            value={testEmailTo}
                            onChange={(e) => setTestEmailTo(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setTestEmailOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendTest} disabled={!testEmailTo || sendingTest}>
                          {sendingTest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Send Email
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyHtml}
                    className="h-8 text-xs border-white/10 text-white/60 hover:text-white"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1.5 text-green-400" /> : <Copy className="h-3 w-3 mr-1.5" />}
                    {copied ? 'Copied' : 'Copy HTML'}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                onClick={onGenerateEmail}
                disabled={!hasContext || emailGenerating}
                className="h-8 text-xs bg-blue-500 hover:bg-blue-600"
              >
                {emailGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {emailGenerating ? 'Generating...' : 'Generate Email'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Email Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Email Preview</h2>
              <p className="text-white/50 mb-4">Select a campaign and account, then generate an email</p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign, Account & Intelligence required</span>
              </div>
            </div>
          </div>
        ) : !emailHtml ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                {emailGenerating ? (
                  <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                ) : (
                  <Wand2 className="h-8 w-8 text-blue-400" />
                )}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {emailGenerating ? 'Generating Email...' : 'Generate a Preview'}
              </h2>
              <p className="text-white/50 mb-4">
                {emailGenerating
                  ? 'AI is crafting a personalized email based on your campaign intelligence...'
                  : 'Click "Generate Email" to create a personalized email preview'}
              </p>
              {!emailGenerating && (
                <Button onClick={onGenerateEmail} className="bg-blue-500 hover:bg-blue-600">
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate Email
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Subject bar */}
            {emailSubject && (
              <div className="px-6 py-3 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider shrink-0">Subject:</span>
                  <span className="text-sm text-white font-medium truncate">{emailSubject}</span>
                </div>
              </div>
            )}
            {/* HTML preview */}
            <div className="flex-1 overflow-auto bg-white">
              <iframe
                srcDoc={emailHtml}
                className="w-full h-full border-0"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Phone Test Section Component
interface PhoneTestSectionProps {
  hasContext: boolean;
  testPhoneNumber: string;
  setTestPhoneNumber: (v: string) => void;
  phoneCallStatus: 'idle' | 'initiating' | 'ringing' | 'active' | 'completed' | 'error';
  phoneCallInfo: {
    campaignName?: string;
    voiceProvider?: string;
    phoneNumber?: string;
    testCallId?: string;
  } | null;
  phoneCallError: string | null;
  phonePostCall: PhonePostCallResult | null;
  onStartPhoneTest: () => void;
  onHangup: () => void;
  onReset: () => void;
  isStarting: boolean;
  isHangingUp: boolean;
  selectedVoice: string;
  setSelectedVoice: (v: string) => void;
  selectedVoiceInfo: VoiceOption | undefined;
}

function PhoneTestSection({
  hasContext,
  testPhoneNumber,
  setTestPhoneNumber,
  phoneCallStatus,
  phoneCallInfo,
  phoneCallError,
  phonePostCall,
  onStartPhoneTest,
  onHangup,
  onReset,
  isStarting,
  isHangingUp,
  selectedVoice,
  setSelectedVoice,
  selectedVoiceInfo,
}: PhoneTestSectionProps) {
  const isCallActive = phoneCallStatus === 'ringing' || phoneCallStatus === 'active';
  const isCallDone = phoneCallStatus === 'completed' || phoneCallStatus === 'error';

  return (
    <div className="h-full flex flex-col">
      {/* Phone Config Bar */}
      <div className="border-b border-white/5 bg-black/10 backdrop-blur-sm">
        <div className="px-5 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Voice Select */}
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="h-4 w-4 text-green-400 shrink-0" />
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider shrink-0">Voice</Label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-sm w-[180px]">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10 text-white max-h-72">
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Male Voices</div>
                  {GEMINI_VOICES.filter(v => v.gender === 'male').map(voice => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{voice.displayName}</span>
                        <span className="text-[10px] text-white/40">{voice.personality.split(',')[0]}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider border-t border-white/5 mt-1">Female Voices</div>
                  {GEMINI_VOICES.filter(v => v.gender === 'female').map(voice => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white focus:bg-white/10 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{voice.displayName}</span>
                        <span className="text-[10px] text-white/40">{voice.personality.split(',')[0]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-px h-6 bg-white/10 shrink-0" />

            {/* Voice info */}
            {selectedVoiceInfo && (
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="border-green-500/30 text-green-300 text-[10px] h-6">
                  {selectedVoiceInfo.displayName}
                </Badge>
                <span className="text-[10px] text-white/30">{selectedVoiceInfo.personality}</span>
              </div>
            )}

            {/* Call status badge */}
            {isCallActive && (
              <div className="ml-auto">
                <Badge className={cn(
                  "text-xs",
                  phoneCallStatus === 'ringing'
                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    : "bg-green-500/20 text-green-300 border-green-500/30 animate-pulse"
                )}>
                  <Radio className="h-3 w-3 mr-1" />
                  {phoneCallStatus === 'ringing' ? 'Ringing...' : 'Call Active'}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Phone Test Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Phone className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">AI Phone Test</h2>
              <p className="text-white/50 mb-4">Select a campaign and account to test a real AI call</p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign, Account & Intelligence required</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-lg">
              {/* Phone Test Card */}
              <div className="bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
                {/* Card Header */}
                <div className="px-6 py-5 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center transition-all",
                      isCallActive
                        ? "bg-green-500 shadow-lg shadow-green-500/30"
                        : phoneCallStatus === 'initiating'
                          ? "bg-blue-500 animate-pulse"
                          : phoneCallStatus === 'error'
                            ? "bg-red-500/30"
                            : "bg-green-500/20"
                    )}>
                      {phoneCallStatus === 'initiating' ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : phoneCallStatus === 'ringing' ? (
                        <PhoneOutgoing className="h-6 w-6 text-white animate-bounce" />
                      ) : phoneCallStatus === 'active' ? (
                        <PhoneCall className="h-6 w-6 text-white" />
                      ) : phoneCallStatus === 'error' ? (
                        <PhoneOff className="h-6 w-6 text-red-400" />
                      ) : phoneCallStatus === 'completed' ? (
                        <CheckCircle2 className="h-6 w-6 text-green-400" />
                      ) : (
                        <Phone className="h-6 w-6 text-green-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold text-lg">
                        {phoneCallStatus === 'idle' && 'Test AI Phone Call'}
                        {phoneCallStatus === 'initiating' && 'Initiating Call...'}
                        {phoneCallStatus === 'ringing' && 'Ringing...'}
                        {phoneCallStatus === 'active' && 'Call Active'}
                        {phoneCallStatus === 'completed' && 'Call Completed'}
                        {phoneCallStatus === 'error' && 'Call Failed'}
                      </h3>
                      <p className="text-sm text-white/50">
                        {phoneCallStatus === 'idle' && 'Enter your phone number to receive a real AI test call'}
                        {phoneCallStatus === 'initiating' && 'Setting up the call...'}
                        {phoneCallStatus === 'ringing' && `Calling ${phoneCallInfo?.phoneNumber || testPhoneNumber}...`}
                        {phoneCallStatus === 'active' && 'The AI agent is on the call with you'}
                        {phoneCallStatus === 'completed' && 'The test call has ended'}
                        {phoneCallStatus === 'error' && (phoneCallError || 'An error occurred')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="px-6 py-5">
                  {phoneCallStatus === 'idle' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm text-white/70">Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                          <Input
                            type="tel"
                            placeholder="+1 (555) 123-4567"
                            value={testPhoneNumber}
                            onChange={(e) => setTestPhoneNumber(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pl-10 h-12 text-lg"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onStartPhoneTest();
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-white/30">
                          Enter the phone number you want the AI agent to call. Must include country code (e.g. +1 for US).
                        </p>
                      </div>

                      <Button
                        onClick={onStartPhoneTest}
                        disabled={isStarting || !testPhoneNumber.trim()}
                        className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-medium text-base"
                      >
                        {isStarting ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Starting Call...
                          </>
                        ) : (
                          <>
                            <PhoneCall className="h-5 w-5 mr-2" />
                            Call Now
                          </>
                        )}
                      </Button>

                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-yellow-300 font-medium">Real Phone Call</p>
                            <p className="text-[11px] text-yellow-300/70 mt-0.5">
                              This will place a real phone call to the number above. The AI agent will speak using the campaign's script
                              and intelligence data.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(phoneCallStatus === 'initiating' || phoneCallStatus === 'ringing') && (
                    <div className="text-center py-6 space-y-4">
                      <div className="relative mx-auto w-20 h-20">
                        <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                        <div className="absolute inset-2 rounded-full bg-green-500/30 animate-ping" style={{ animationDelay: '0.5s' }} />
                        <div className="relative h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
                          <PhoneOutgoing className="h-8 w-8 text-green-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {phoneCallStatus === 'initiating' ? 'Setting up...' : 'Ringing...'}
                        </p>
                        <p className="text-sm text-white/50 mt-1">
                          {phoneCallInfo?.phoneNumber || testPhoneNumber}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={onHangup}
                        disabled={isHangingUp}
                        className="mt-2"
                      >
                        <PhoneOff className="h-4 w-4 mr-2" />
                        Cancel Call
                      </Button>
                    </div>
                  )}

                  {phoneCallStatus === 'active' && (
                    <div className="text-center py-6 space-y-4">
                      <div className="relative mx-auto w-20 h-20">
                        <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
                        <div className="relative h-20 w-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                          <PhoneCall className="h-8 w-8 text-white" />
                        </div>
                      </div>
                      <div>
                        <p className="text-white font-medium text-lg">Call Active</p>
                        <p className="text-sm text-white/50 mt-1">
                          AI Agent is speaking with you on {phoneCallInfo?.phoneNumber || testPhoneNumber}
                        </p>
                        {phoneCallInfo?.campaignName && (
                          <Badge variant="outline" className="border-green-500/30 text-green-300 text-xs mt-2">
                            {phoneCallInfo.campaignName}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="lg"
                        onClick={onHangup}
                        disabled={isHangingUp}
                        className="mt-4"
                      >
                        {isHangingUp ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <PhoneOff className="h-4 w-4 mr-2" />
                        )}
                        {isHangingUp ? 'Ending...' : 'Hang Up'}
                      </Button>
                    </div>
                  )}

                  {phoneCallStatus === 'completed' && (
                    <div className="text-center py-6 space-y-4">
                      <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="h-8 w-8 text-green-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Call Completed</p>
                        <p className="text-sm text-white/50 mt-1">
                          The test call to {phoneCallInfo?.phoneNumber || testPhoneNumber} has ended.
                        </p>
                        {phonePostCall?.finalDisposition && (
                          <Badge variant="outline" className="border-green-500/30 text-green-300 text-xs mt-2">
                            Disposition: {phonePostCall.finalDisposition}
                          </Badge>
                        )}
                        {phonePostCall?.postCallAnalysis?.summary && (
                          <p className="text-xs text-white/60 mt-2 max-w-md mx-auto">
                            {phonePostCall.postCallAnalysis.summary}
                          </p>
                        )}
                        {typeof phonePostCall?.postCallAnalysis?.conversationQuality?.overallScore === 'number' && (
                          <p className="text-xs text-cyan-300 mt-1">
                            Quality score: {Math.round(phonePostCall.postCallAnalysis.conversationQuality.overallScore)}/100
                          </p>
                        )}
                      </div>
                      <Button onClick={onReset} className="bg-green-500 hover:bg-green-600">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Test Again
                      </Button>
                    </div>
                  )}

                  {phoneCallStatus === 'error' && (
                    <div className="text-center py-6 space-y-4">
                      <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                        <AlertCircle className="h-8 w-8 text-red-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium">Call Failed</p>
                        <p className="text-sm text-red-400/80 mt-1">{phoneCallError || 'An error occurred'}</p>
                      </div>
                      <Button onClick={onReset} variant="outline" className="border-white/10 text-white">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

