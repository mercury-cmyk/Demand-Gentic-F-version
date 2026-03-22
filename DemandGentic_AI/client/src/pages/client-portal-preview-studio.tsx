/**
 * Client Portal Preview Studio Page
 * Allows client users to test voice and email experiences for their campaigns.
 * Uses client portal API endpoints for authentication.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

function dedupeById(items: T[]): T[] {
  const seen = new Set();
  const unique: T[] = [];
  for (const item of items) {
    const rawId = item?.id;
    if (rawId === null || rawId === undefined) {
      unique.push(item);
      continue;
    }
    const id = String(rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
  }
  return unique;
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
const getAuthHeaders = (): Record => {
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
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);

  // Preview mode
  const [previewMode, setPreviewMode] = useState('voice');

  // Voice settings
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [voiceTone, setVoiceTone] = useState('professional');
  const [voiceSimStatus, setVoiceSimStatus] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState>([]);
  const [voiceSessionId, setVoiceSessionId] = useState(null);
  const [chatInput, setChatInput] = useState('');

  // Email settings
  const [emailType, setEmailType] = useState('cold_outreach');
  const [emailHtml, setEmailHtml] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailGenerating, setEmailGenerating] = useState(false);

  // Phone test call state
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [phoneCallStatus, setPhoneCallStatus] = useState('idle');
  const [phoneSessionId, setPhoneSessionId] = useState(null);
  const [phoneCallInfo, setPhoneCallInfo] = useState(null);
  const [phoneCallError, setPhoneCallError] = useState(null);
  const [phonePostCall, setPhonePostCall] = useState(null);

  // Voice preview state
  const [previewingVoiceId, setPreviewingVoiceId] = useState(null);

  // Refs
  const playPreviewRef = useRef(null);
  const transcriptEndRef = useRef(null);

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
  const { data: campaignsRaw = [], isLoading: campaignsLoading } = useQuery({
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
  const campaigns = useMemo(() => dedupeById(campaignsRaw), [campaignsRaw]);

  // Fetch preview audience (accounts and contacts) for selected campaign
  const { data: audienceData, isLoading: audienceLoading } = useQuery;
    contacts: Array;
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
  const { data: intelligenceStatus, isLoading: intelligenceLoading } = useQuery({
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
  const [intelligenceAutoTriggered, setIntelligenceAutoTriggered] = useState(null);
  const [intelligencePhase, setIntelligencePhase] = useState('idle');

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
        toast({ title: 'Intelligence Ready', description: 'Core intelligence is ready. You can start the preview while optional research finishes.' });
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
  const accounts: Account[] = dedupeById(audienceData?.accounts || []).map(a => ({
    id: a.id,
    name: a.name,
    domain: a.website,
  }));
  const accountsLoading = audienceLoading;

  // Transform and filter contacts by selected account
  const allContacts = dedupeById(audienceData?.contacts || []).map(c => ({
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
      const contactPayload: Record = {};
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
          voiceProvider: 'openai',
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
  const phonePollingRef = useRef | null>(null);

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
    if (!testPhoneNumber.trim() || testPhoneNumber.trim().length  {
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
    
      
        {/* Gradient Background Effects */}
        
          
          
          
        

        {/* Header */}
        
          
            
              
                
                  
                
                
                  Preview Studio
                  Test voice & email experiences
                
              

              {/* Voice / Email / Phone Mode Toggle */}
              
                 setPreviewMode('voice')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'voice'
                      ? "bg-purple-500/30 text-purple-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  
                  Chat Sim
                
                 setPreviewMode('phone')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'phone'
                      ? "bg-green-500/30 text-green-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  
                  Phone Test
                
                 setPreviewMode('email')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    previewMode === 'email'
                      ? "bg-blue-500/30 text-blue-300 shadow-sm"
                      : "text-white/50 hover:text-white/70"
                  )}
                >
                  
                  Email
                
              
            
          
        

        {/* Main Content */}
        
          {/* Left Panel - Context & Intelligence */}
          
            
              
                
                Context & Intelligence
              
            

            
              {/* Campaign */}
              
                Campaign
                 { setSelectedCampaignId(v); setSelectedAccountId(null); setSelectedContactId(null); }}>
                  
                    
                  
                  
                    {campaigns.map(c => (
                      
                        {c.name}
                      
                    ))}
                  
                
              

              {/* Account */}
              
                Account
                 { setSelectedAccountId(v); setSelectedContactId(null); }}
                  disabled={!selectedCampaignId}
                >
                  
                    
                  
                  
                    {accounts.map(a => (
                      
                        
                          
                          {a.name}
                        
                      
                    ))}
                  
                
              

              {/* Contact */}
              
                
                  Contact (Optional)
                
                
                  
                    
                  
                  
                    {contacts.map(c => (
                      
                        
                          {c.fullName || c.email}
                          {c.jobTitle && {c.jobTitle}}
                        
                      
                    ))}
                  
                
              

            

            {/* Intelligence Research Steps — expanded panel */}
            {hasBasicContext && (
              
                {intelligenceLoading ? (
                  
                    
                      
                      Checking intelligence...
                    
                  
                ) : (() => {
                  const isResearching = generateIntelligenceMutation.isPending || intelligencePhase === 'researching';
                  const acctDone = intelligenceStatus?.accountIntelligence?.available || false;
                  const orgDone = intelligenceStatus?.organizationIntelligence?.available || false;
                  const solnDone = intelligenceStatus?.solutionMapping?.available || false;
                  const probDone = intelligenceStatus?.problemIntelligence?.available || false;
                  // Preview unlocks once account intelligence is available.
                  // Problem Intelligence, Org Intelligence, and Solution Mapping are quality enhancements.
                  const coreReady = intelligenceReady; // ready now means core components only
                  const allDone = acctDone && orgDone && solnDone && probDone;

                  const stepItems = [
                    { key: 'acct', label: 'Account Intelligence', description: 'Prospect company research', icon: Brain, done: acctDone, confidence: intelligenceStatus?.accountIntelligence?.confidence, required: true },
                    { key: 'prob', label: 'Problem Intelligence', description: 'Problem detection & messaging (recommended)', icon: Zap, done: probDone, confidence: intelligenceStatus?.problemIntelligence?.confidence, required: false },
                    { key: 'org', label: 'Organization Intelligence', description: 'Your company profile (optional)', icon: Building2, done: orgDone, required: false },
                    { key: 'soln', label: 'Solution Mapping', description: 'Product-problem alignment (optional)', icon: Target, done: solnDone, required: false },
                  ];

                  return (
                    
                      {/* Header */}
                      
                        {coreReady ? (
                          <>Ready to Preview
                        ) : isResearching ? (
                          <>Researching Intelligence...
                        ) : (
                          <>Preparing Intelligence
                        )}
                      

                      {/* Steps — spacious vertical layout */}
                      
                        {stepItems.map((step) => {
                          const Icon = step.icon;
                          const showSpinner = isResearching && !step.done;
                          return (
                            
                              {/* Status indicator */}
                              
                                {step.done ? (
                                  
                                ) : showSpinner ? (
                                  
                                ) : (
                                  
                                )}
                              
                              {/* Icon + label + description */}
                              
                                
                                  
                                  
                                    {step.label}
                                    {step.done && step.confidence ? ` (${Math.round(step.confidence * 100)}%)` : ''}
                                  
                                
                                {step.description}
                              
                              {/* Status badge */}
                              
                                {step.done ? 'Done' : showSpinner ? 'Researching' : !step.required ? 'Optional' : 'Required'}
                              
                            
                          );
                        })}
                      

                      {/* Footer message */}
                      {coreReady ? (
                        
                          
                          {allDone ? 'All intelligence ready' : 'Core intelligence ready'} — start the preview.
                        
                      ) : isResearching ? (
                        
                          Analyzing {selectedAccount?.name || 'account'} and mapping solutions...
                        
                      ) : (
                         generateIntelligenceMutation.mutate()}
                          disabled={generateIntelligenceMutation.isPending}
                        >
                          Generate Intelligence
                        
                      )}
                    
                  );
                })()}
              
            )}
          

          {/* Main Preview Area */}
          
            {previewMode === 'voice' ? (
              
            ) : previewMode === 'phone' ? (
              
            ) : (
               {
                  if (!emailHtml) return;
                  await sendTestEmailMutation.mutateAsync({
                    to,
                    subject: emailSubject || 'Test Email',
                    html: emailHtml
                  });
                }}
              />
            )}
          
        
      
    
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
  voiceTranscripts: Array;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  transcriptEndRef: React.RefObject;
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
    
      {/* Compact Voice Configuration Bar */}
      
        
          
            {/* Voice Select */}
            
              
              Voice
              
                
                  
                
                
                  Male Voices
                  {GEMINI_VOICES.filter(v => v.gender === 'male').map(voice => (
                    
                      
                        {voice.displayName}
                        {voice.personality.split(',')[0]}
                      
                    
                  ))}
                  Female Voices
                  {GEMINI_VOICES.filter(v => v.gender === 'female').map(voice => (
                    
                      
                        {voice.displayName}
                        {voice.personality.split(',')[0]}
                      
                    
                  ))}
                
              
              {/* Preview button */}
               onPreviewVoice(selectedVoice)}
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
                  
                ) : (
                  
                )}
              
            

            {/* Divider */}
            

            {/* Tone Select */}
            
              Tone
              
                
                  
                
                
                  {VOICE_TONES.map(tone => (
                    
                      
                        {tone.label}
                        {tone.description}
                      
                    
                  ))}
                
              
            

            {/* Divider */}
            

            {/* Selected voice info badge */}
            {selectedVoiceInfo && (
              
                
                  {selectedVoiceInfo.displayName}
                
                {selectedVoiceInfo.personality}
              
            )}
          
        
      

      {/* Simulation Area */}
      
        {!hasContext ? (
          
            
              
                
              
              Voice Preview
              Select a campaign and account to start testing
              
                
                Campaign, Account & Core Intelligence required
              
            
          
        ) : (
          <>
            {/* Call Status Bar */}
            
              
                
                  
                    {voiceSimStatus === 'connecting' ? (
                      
                    ) : (
                      
                    )}
                  
                  
                    
                      {voiceSimStatus === 'active' ? 'Call Active' : voiceSimStatus === 'connecting' ? 'Connecting...' : 'Ready to Call'}
                    
                    
                      {selectedVoiceInfo?.displayName} — {VOICE_TONES.find(t => t.value === voiceTone)?.label || voiceTone}
                    
                  
                
                
                  {voiceSimStatus === 'active' && (
                     setIsMuted(!isMuted)}
                      className={cn(isMuted ? "bg-red-500/20 border-red-500/50" : "bg-white/5")}
                    >
                      {isMuted ?  : }
                    
                  )}
                  {voiceSimStatus === 'idle' ? (
                    
                      {isStarting ? (
                        
                      ) : (
                        
                      )}
                      {isStarting ? 'Starting...' : 'Start Test'}
                    
                  ) : voiceSimStatus === 'connecting' ? (
                    
                      
                      Connecting...
                    
                  ) : (
                    
                      
                      End Call
                    
                  )}
                
              
            

            {/* Transcript + Chat */}
            
              {/* Transcript Area */}
              
                {voiceTranscripts.length === 0 ? (
                  
                    
                      
                      
                        Start a test to see the conversation
                      
                    
                  
                ) : (
                  
                    {voiceTranscripts.map((msg, idx) => (
                      
                        
                          
                            
                              {msg.role === 'user' ? 'You (Contact)' : 'AI Agent'}
                            
                            
                              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            
                          
                          {msg.content}
                        
                      
                    ))}
                    {isSending && (
                      
                        
                          
                            
                            AI is thinking...
                          
                        
                      
                    )}
                    
                  
                )}
              

              {/* Chat Input — only visible when call is active */}
              {voiceSimStatus === 'active' && (
                
                  
                     setChatInput(e.target.value)}
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
                    
                      {isSending ? (
                        
                      ) : (
                        
                      )}
                    
                  
                  Press Enter to send. You're playing the prospect receiving the call.
                
              )}
            
          
        )}
      
    
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
  onSendTest?: (to: string) => Promise;
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
    
      {/* Email Config Bar */}
      
        
          
            
              
              Type
              
                
                  
                
                
                  {EMAIL_TYPES.map(type => (
                    
                      
                        {type.label}
                        {type.description}
                      
                    
                  ))}
                
              
            

            

            {/* Target info */}
            {selectedAccount && (
              
                
                  
                  {selectedAccount.name}
                
                {selectedContact && (
                  
                    
                    {selectedContact.fullName}
                  
                )}
              
            )}

            
              {emailHtml && (
                <>
                  
                    
                      
                        
                        Send Test
                      
                    
                    
                      
                        Send Test Email
                        
                          Send this preview to yourself or a colleague.
                        
                      
                      
                        
                          Recipient Email
                           setTestEmailTo(e.target.value)}
                          />
                        
                      
                      
                         setTestEmailOpen(false)}>Cancel
                        
                          {sendingTest && }
                          Send Email
                        
                      
                    
                  

                  
                    {copied ?  : }
                    {copied ? 'Copied' : 'Copy HTML'}
                  
                
              )}
              
                {emailGenerating ? (
                  
                ) : (
                  
                )}
                {emailGenerating ? 'Generating...' : 'Generate Email'}
              
            
          
        
      

      {/* Email Preview Area */}
      
        {!hasContext ? (
          
            
              
                
              
              Email Preview
              Select a campaign and account, then generate an email
              
                
                Campaign, Account & Core Intelligence required
              
            
          
        ) : !emailHtml ? (
          
            
              
                {emailGenerating ? (
                  
                ) : (
                  
                )}
              
              
                {emailGenerating ? 'Generating Email...' : 'Generate a Preview'}
              
              
                {emailGenerating
                  ? 'AI is crafting a personalized email based on your campaign intelligence...'
                  : 'Click "Generate Email" to create a personalized email preview'}
              
              {!emailGenerating && (
                
                  
                  Generate Email
                
              )}
            
          
        ) : (
          
            {/* Subject bar */}
            {emailSubject && (
              
                
                  Subject:
                  {emailSubject}
                
              
            )}
            {/* HTML preview */}
            
              
            
          
        )}
      
    
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
    
      {/* Phone Config Bar */}
      
        
          
            {/* Voice Select */}
            
              
              Voice
              
                
                  
                
                
                  Male Voices
                  {GEMINI_VOICES.filter(v => v.gender === 'male').map(voice => (
                    
                      
                        {voice.displayName}
                        {voice.personality.split(',')[0]}
                      
                    
                  ))}
                  Female Voices
                  {GEMINI_VOICES.filter(v => v.gender === 'female').map(voice => (
                    
                      
                        {voice.displayName}
                        {voice.personality.split(',')[0]}
                      
                    
                  ))}
                
              
            

            

            {/* Voice info */}
            {selectedVoiceInfo && (
              
                
                  {selectedVoiceInfo.displayName}
                
                {selectedVoiceInfo.personality}
              
            )}

            {/* Call status badge */}
            {isCallActive && (
              
                
                  
                  {phoneCallStatus === 'ringing' ? 'Ringing...' : 'Call Active'}
                
              
            )}
          
        
      

      {/* Main Phone Test Area */}
      
        {!hasContext ? (
          
            
              
                
              
              AI Phone Test
              Select a campaign and account to test a real AI call
              
                
                Campaign, Account & Core Intelligence required
              
            
          
        ) : (
          
            
              {/* Phone Test Card */}
              
                {/* Card Header */}
                
                  
                    
                      {phoneCallStatus === 'initiating' ? (
                        
                      ) : phoneCallStatus === 'ringing' ? (
                        
                      ) : phoneCallStatus === 'active' ? (
                        
                      ) : phoneCallStatus === 'error' ? (
                        
                      ) : phoneCallStatus === 'completed' ? (
                        
                      ) : (
                        
                      )}
                    
                    
                      
                        {phoneCallStatus === 'idle' && 'Test AI Phone Call'}
                        {phoneCallStatus === 'initiating' && 'Initiating Call...'}
                        {phoneCallStatus === 'ringing' && 'Ringing...'}
                        {phoneCallStatus === 'active' && 'Call Active'}
                        {phoneCallStatus === 'completed' && 'Call Completed'}
                        {phoneCallStatus === 'error' && 'Call Failed'}
                      
                      
                        {phoneCallStatus === 'idle' && 'Enter your phone number to receive a real AI test call'}
                        {phoneCallStatus === 'initiating' && 'Setting up the call...'}
                        {phoneCallStatus === 'ringing' && `Calling ${phoneCallInfo?.phoneNumber || testPhoneNumber}...`}
                        {phoneCallStatus === 'active' && 'The AI agent is on the call with you'}
                        {phoneCallStatus === 'completed' && 'The test call has ended'}
                        {phoneCallStatus === 'error' && (phoneCallError || 'An error occurred')}
                      
                    
                  
                

                {/* Card Body */}
                
                  {phoneCallStatus === 'idle' && (
                    
                      
                        Phone Number
                        
                          
                           setTestPhoneNumber(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pl-10 h-12 text-lg"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onStartPhoneTest();
                            }}
                          />
                        
                        
                          Enter the phone number you want the AI agent to call. Must include country code (e.g. +1 for US).
                        
                      

                      
                        {isStarting ? (
                          <>
                            
                            Starting Call...
                          
                        ) : (
                          <>
                            
                            Call Now
                          
                        )}
                      

                      
                        
                          
                          
                            Real Phone Call
                            
                              This will place a real phone call to the number above. The AI agent will speak using the campaign's script
                              and intelligence data.
                            
                          
                        
                      
                    
                  )}

                  {(phoneCallStatus === 'initiating' || phoneCallStatus === 'ringing') && (
                    
                      
                        
                        
                        
                          
                        
                      
                      
                        
                          {phoneCallStatus === 'initiating' ? 'Setting up...' : 'Ringing...'}
                        
                        
                          {phoneCallInfo?.phoneNumber || testPhoneNumber}
                        
                      
                      
                        
                        Cancel Call
                      
                    
                  )}

                  {phoneCallStatus === 'active' && (
                    
                      
                        
                        
                          
                        
                      
                      
                        Call Active
                        
                          AI Agent is speaking with you on {phoneCallInfo?.phoneNumber || testPhoneNumber}
                        
                        {phoneCallInfo?.campaignName && (
                          
                            {phoneCallInfo.campaignName}
                          
                        )}
                      
                      
                        {isHangingUp ? (
                          
                        ) : (
                          
                        )}
                        {isHangingUp ? 'Ending...' : 'Hang Up'}
                      
                    
                  )}

                  {phoneCallStatus === 'completed' && (
                    
                      
                        
                      
                      
                        Call Completed
                        
                          The test call to {phoneCallInfo?.phoneNumber || testPhoneNumber} has ended.
                        
                        {phonePostCall?.finalDisposition && (
                          
                            Disposition: {phonePostCall.finalDisposition}
                          
                        )}
                        {phonePostCall?.postCallAnalysis?.summary && (
                          
                            {phonePostCall.postCallAnalysis.summary}
                          
                        )}
                        {typeof phonePostCall?.postCallAnalysis?.conversationQuality?.overallScore === 'number' && (
                          
                            Quality score: {Math.round(phonePostCall.postCallAnalysis.conversationQuality.overallScore)}/100
                          
                        )}
                      
                      
                        
                        Test Again
                      
                    
                  )}

                  {phoneCallStatus === 'error' && (
                    
                      
                        
                      
                      
                        Call Failed
                        {phoneCallError || 'An error occurred'}
                      
                      
                        
                        Try Again
                      
                    
                  )}
                
              
            
          
        )}
      
    
  );
}