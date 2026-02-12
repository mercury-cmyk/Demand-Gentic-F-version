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
                    <p className="text-sm text-white/50">{selectedVoiceInfo?.displayName} — {VOICE_TONES.find(t => t.value === voiceTone)?.label || voiceTone}</p>
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

