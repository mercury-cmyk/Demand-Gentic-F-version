/**
 * Client Portal Preview Studio Page
 * Allows client users to test voice and email experiences for their campaigns.
 * Uses client portal API endpoints for authentication.
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import {
  Phone,
  PhoneCall,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  // Context selection
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Voice settings
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [voiceTone, setVoiceTone] = useState<string>('professional');
  const [voiceSimStatus, setVoiceSimStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<Array<{ role: string; content: string; timestamp: Date }>>([]);

  // Voice preview state
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // Refs
  const playPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Update from URL
  useEffect(() => {
    if (campaignIdFromUrl && campaignIdFromUrl !== selectedCampaignId) {
      setSelectedCampaignId(campaignIdFromUrl);
    }
  }, [campaignIdFromUrl, selectedCampaignId]);

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
                  <p className="text-xs text-white/50">Test voice experiences</p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex h-[calc(100vh-200px)]">
          {/* Left Panel - Context Selection */}
          <div className="w-64 border-r border-white/5 bg-black/20 backdrop-blur-xl flex flex-col shrink-0">
            <div className="p-3 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-purple-400" />
                Context
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

            {/* Intelligence Status */}
            {hasBasicContext && (
              <div className="border-t border-white/5">
                {intelligenceLoading ? (
                  <div className="p-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <div className="flex items-center gap-2 text-blue-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking intelligence...</span>
                    </div>
                  </div>
                ) : intelligenceReady ? (
                  <div className="p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10">
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Intelligence Ready</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-green-400/80">
                        <Brain className="h-3 w-3" />
                        <span>Account Intelligence{intelligenceStatus?.accountIntelligence?.confidence ? ` (${Math.round(intelligenceStatus.accountIntelligence.confidence * 100)}%)` : ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-green-400/80">
                        <Building2 className="h-3 w-3" />
                        <span>Org Intelligence</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-green-400/80">
                        <Target className="h-3 w-3" />
                        <span>Solution Mapping</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/40 mt-1 truncate">
                      {selectedAccount?.name} {selectedContact && `• ${selectedContact.fullName}`}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Intelligence Required</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {intelligenceStatus?.accountIntelligence && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {intelligenceStatus.accountIntelligence.available ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-400" />
                          )}
                          <span className={intelligenceStatus.accountIntelligence.available ? 'text-green-400/80' : 'text-amber-400/80'}>
                            Account Intelligence
                          </span>
                        </div>
                      )}
                      {intelligenceStatus?.organizationIntelligence && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {intelligenceStatus.organizationIntelligence.available ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-400" />
                          )}
                          <span className={intelligenceStatus.organizationIntelligence.available ? 'text-green-400/80' : 'text-amber-400/80'}>
                            Org Intelligence
                          </span>
                        </div>
                      )}
                      {intelligenceStatus?.solutionMapping && (
                        <div className="flex items-center gap-1.5 text-xs">
                          {intelligenceStatus.solutionMapping.available ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-400" />
                          )}
                          <span className={intelligenceStatus.solutionMapping.available ? 'text-green-400/80' : 'text-amber-400/80'}>
                            Solution Mapping
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-amber-400/60 mt-2">
                      Contact your admin to configure missing intelligence components.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main Preview Area */}
          <div className="flex-1 overflow-hidden">
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
              setVoiceSimStatus={setVoiceSimStatus}
              isMuted={isMuted}
              setIsMuted={setIsMuted}
              voiceTranscripts={voiceTranscripts}
            />
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
  setVoiceSimStatus: (s: 'idle' | 'connecting' | 'active' | 'completed') => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  voiceTranscripts: Array<{ role: string; content: string; timestamp: Date }>;
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
  setVoiceSimStatus,
  isMuted,
  setIsMuted,
  voiceTranscripts,
}: VoicePreviewSectionProps) {
  const maleVoices = GEMINI_VOICES.filter(v => v.gender === 'male');
  const femaleVoices = GEMINI_VOICES.filter(v => v.gender === 'female');

  return (
    <div className="h-full flex">
      {/* Voice Configuration Panel */}
      <div className="w-80 border-r border-white/5 bg-black/10 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-purple-400" />
            Voice Configuration
          </h3>
          <p className="text-[11px] text-white/40 mt-1">24 Gemini voices available</p>
        </div>

        <ScrollArea className="flex-1 p-4">
          {/* Voice Selection */}
          <div className="space-y-4 mb-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Male Voices ({maleVoices.length})</Label>
              <div className="space-y-1">
                {maleVoices.map(voice => (
                  <div
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={cn(
                      "group w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                      selectedVoice === voice.id
                        ? "bg-blue-500/20 border-blue-500/50 shadow-sm shadow-blue-500/10"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm">{voice.displayName}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewVoice(voice.id); }}
                        disabled={previewingVoiceId === voice.id}
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center transition-all duration-200 shrink-0",
                          previewingVoiceId === voice.id
                            ? "bg-blue-500/30 border border-blue-400/50"
                            : "bg-white/10 hover:bg-blue-500/30 border border-transparent hover:border-blue-400/50 opacity-0 group-hover:opacity-100",
                          selectedVoice === voice.id && "opacity-100"
                        )}
                        title={`Preview ${voice.displayName}`}
                      >
                        {previewingVoiceId === voice.id ? (
                          <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 text-blue-400 ml-0.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{voice.personality}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Female Voices ({femaleVoices.length})</Label>
              <div className="space-y-1">
                {femaleVoices.map(voice => (
                  <div
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={cn(
                      "group w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer",
                      selectedVoice === voice.id
                        ? "bg-pink-500/20 border-pink-500/50 shadow-sm shadow-pink-500/10"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium text-sm">{voice.displayName}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onPreviewVoice(voice.id); }}
                        disabled={previewingVoiceId === voice.id}
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center transition-all duration-200 shrink-0",
                          previewingVoiceId === voice.id
                            ? "bg-pink-500/30 border border-pink-400/50"
                            : "bg-white/10 hover:bg-pink-500/30 border border-transparent hover:border-pink-400/50 opacity-0 group-hover:opacity-100",
                          selectedVoice === voice.id && "opacity-100"
                        )}
                        title={`Preview ${voice.displayName}`}
                      >
                        {previewingVoiceId === voice.id ? (
                          <Loader2 className="h-3 w-3 text-pink-400 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3 text-pink-400 ml-0.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{voice.personality}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator className="bg-white/10 mb-4" />

          {/* Tone Selection */}
          <div className="space-y-2">
            <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Tone</Label>
            <div className="space-y-1">
              {VOICE_TONES.map(tone => (
                <button
                  key={tone.value}
                  onClick={() => setVoiceTone(tone.value)}
                  className={cn(
                    "w-full p-2.5 rounded-lg border text-left transition-all",
                    voiceTone === tone.value
                      ? "bg-purple-500/20 border-purple-500/50"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  )}
                >
                  <span className="text-white text-sm">{tone.label}</span>
                  <p className="text-[10px] text-white/40 mt-0.5">{tone.description}</p>
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Simulation Area */}
      <div className="flex-1 flex flex-col">
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
                <span>Campaign and Account required</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center",
                    voiceSimStatus === 'active'
                      ? "bg-green-500 animate-pulse"
                      : "bg-purple-500/20"
                  )}>
                    <PhoneCall className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium">
                      {voiceSimStatus === 'active' ? 'Call Active' : 'Ready'}
                    </h3>
                    <p className="text-sm text-white/50">{selectedVoiceInfo?.displayName}</p>
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
                      onClick={() => setVoiceSimStatus('active')}
                      className="bg-purple-500 hover:bg-purple-600"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Start Test
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setVoiceSimStatus('idle')}
                      variant="destructive"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      End
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 p-4">
              <div className="h-full bg-white/5 rounded-xl border border-white/10 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-white/40 text-sm">
                    {voiceSimStatus === 'idle' ? 'Start a test to see transcript' : 'Conversation will appear here'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

