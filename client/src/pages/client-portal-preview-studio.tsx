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

const SCENARIOS = [
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'demo_request', label: 'Demo Request' },
  { value: 'objection_handling', label: 'Objection Handling' },
];

const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch to prospects' },
  { value: 'follow_up', label: 'Follow Up', description: 'After initial contact' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Request for a call' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content' },
  { value: 'breakup', label: 'Breakup', description: 'Final outreach' },
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

  // Tab state
  const [activeSection, setActiveSection] = useState<'voice' | 'email'>('voice');

  // Context selection
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Voice settings
  const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
  const [voiceTone, setVoiceTone] = useState<string>('professional');
  const [scenario, setScenario] = useState<string>('cold_outreach');
  const [voiceSimStatus, setVoiceSimStatus] = useState<'idle' | 'connecting' | 'active' | 'completed'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<Array<{ role: string; content: string; timestamp: Date }>>([]);

  // Email settings
  const [emailType, setEmailType] = useState<string>('cold_outreach');
  const [generatedEmail, setGeneratedEmail] = useState<any>(null);
  const [emailPreviewMode, setEmailPreviewMode] = useState<'preview' | 'html'>('preview');
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
      const res = await fetch(`/api/client-portal/campaigns/${selectedCampaignId}/preview-audience`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch preview audience');
      return res.json();
    },
    enabled: !!selectedCampaignId,
  });

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

  // Handle voice preview
  const handlePreviewVoice = async () => {
    try {
      if (playPreviewRef.current) {
        playPreviewRef.current.pause();
        playPreviewRef.current = null;
      }
      const response = await fetch('/api/voice-providers/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          voiceId: selectedVoice,
          provider: 'gemini',
        }),
      });
      if (!response.ok) throw new Error('Failed to generate preview');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      playPreviewRef.current = audio;
      await audio.play();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Preview Failed', description: 'Could not play voice preview' });
    }
  };

  // Email generation mutation
  const generateEmailMutation = useMutation({
    mutationFn: async () => {
      // Use client portal simulation endpoint
      const res = await fetch('/api/client-portal/simulation/generate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          accountId: selectedAccountId,
          contactId: selectedContactId,
          emailType,
        }),
      });
      if (!res.ok) {
        // Fallback: generate mock email for demo
        return {
          subject: `${emailType === 'cold_outreach' ? 'Introducing' : 'Following up on'} ${selectedAccount?.name || 'your business'}`,
          preheader: 'Personalized outreach for your team',
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Hello ${selectedContact?.fullName?.split(' ')[0] || 'there'},</h2>
            <p>I hope this email finds you well. I wanted to reach out regarding opportunities for ${selectedAccount?.name || 'your organization'}.</p>
            <p>Based on your role as ${selectedContact?.jobTitle || 'a key decision maker'}, I believe we could provide significant value to your team.</p>
            <p>Would you be open to a brief conversation this week?</p>
            <p>Best regards,<br/>Your Sales Team</p>
          </div>`,
        };
      }
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedEmail(data);
      toast({ title: 'Email Generated', description: 'Preview ready with account context' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    },
  });

  // Copy handler
  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const hasRequiredContext = !!(selectedCampaignId && selectedAccountId);

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
                  <p className="text-xs text-white/50">Test voice and email experiences</p>
                </div>
              </div>

              {/* Section Switcher */}
              <div className="flex items-center bg-white/5 rounded-2xl p-1.5 border border-white/10">
                <button
                  onClick={() => setActiveSection('voice')}
                  className={cn(
                    "flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-medium transition-all duration-200",
                    activeSection === 'voice'
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Phone className="h-4 w-4" />
                  Voice
                </button>
                <button
                  onClick={() => setActiveSection('email')}
                  className={cn(
                    "flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-medium transition-all duration-200",
                    activeSection === 'email'
                      ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>
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
                <Select value={selectedCampaignId || ''} onValueChange={(v) => { setSelectedCampaignId(v); setSelectedAccountId(null); setSelectedContactId(null); }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={campaignsLoading ? "Loading..." : "Select campaign"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
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
                  value={selectedAccountId || ''}
                  onValueChange={(v) => { setSelectedAccountId(v); setSelectedContactId(null); }}
                  disabled={!selectedCampaignId}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={accountsLoading ? "Loading..." : "Select account"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
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
                  value={selectedContactId || ''}
                  onValueChange={setSelectedContactId}
                  disabled={!selectedAccountId}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue placeholder={contactsLoading ? "Loading..." : "Select contact"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
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

              {/* Scenario */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Scenario</Label>
                <Select value={scenario} onValueChange={setScenario}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                    {SCENARIOS.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-white focus:bg-white/10 focus:text-white">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Context Summary */}
            {hasRequiredContext && (
              <div className="p-3 border-t border-white/5 bg-gradient-to-r from-green-500/10 to-emerald-500/10">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Context Ready</span>
                </div>
                <p className="text-xs text-white/40 mt-1 truncate">
                  {selectedAccount?.name} {selectedContact && `• ${selectedContact.fullName}`}
                </p>
              </div>
            )}
          </div>

          {/* Main Preview Area */}
          <div className="flex-1 overflow-hidden">
            {activeSection === 'voice' ? (
              <VoicePreviewSection
                hasContext={hasRequiredContext}
                selectedVoice={selectedVoice}
                setSelectedVoice={setSelectedVoice}
                voiceTone={voiceTone}
                setVoiceTone={setVoiceTone}
                selectedVoiceInfo={selectedVoiceInfo}
                onPreviewVoice={handlePreviewVoice}
                voiceSimStatus={voiceSimStatus}
                setVoiceSimStatus={setVoiceSimStatus}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                voiceTranscripts={voiceTranscripts}
              />
            ) : (
              <EmailPreviewSection
                hasContext={hasRequiredContext}
                emailType={emailType}
                setEmailType={setEmailType}
                generatedEmail={generatedEmail}
                emailPreviewMode={emailPreviewMode}
                setEmailPreviewMode={setEmailPreviewMode}
                onGenerate={() => generateEmailMutation.mutate()}
                isGenerating={generateEmailMutation.isPending}
                copiedField={copiedField}
                onCopy={handleCopy}
                selectedAccount={selectedAccount}
                selectedContact={selectedContact}
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
  onPreviewVoice: () => void;
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
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={cn(
                      "w-full p-2.5 rounded-lg border text-left transition-all",
                      selectedVoice === voice.id
                        ? "bg-blue-500/20 border-blue-500/50 shadow-sm shadow-blue-500/10"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <span className="text-white font-medium text-sm">{voice.displayName}</span>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{voice.personality}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-medium text-white/50 uppercase tracking-wider">Female Voices ({femaleVoices.length})</Label>
              <div className="space-y-1">
                {femaleVoices.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={cn(
                      "w-full p-2.5 rounded-lg border text-left transition-all",
                      selectedVoice === voice.id
                        ? "bg-pink-500/20 border-pink-500/50 shadow-sm shadow-pink-500/10"
                        : "bg-white/5 border-white/10 hover:bg-white/10"
                    )}
                  >
                    <span className="text-white font-medium text-sm">{voice.displayName}</span>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{voice.personality}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewVoice}
            className="w-full mb-4 bg-white/5 border-white/10 text-white hover:bg-white/10"
          >
            <Play className="h-4 w-4 mr-2" />
            Preview Voice
          </Button>

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

// Email Preview Section
interface EmailPreviewSectionProps {
  hasContext: boolean;
  emailType: string;
  setEmailType: (t: string) => void;
  generatedEmail: any;
  emailPreviewMode: 'preview' | 'html';
  setEmailPreviewMode: (m: 'preview' | 'html') => void;
  onGenerate: () => void;
  isGenerating: boolean;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  selectedAccount: Account | undefined;
  selectedContact: Contact | undefined;
}

function EmailPreviewSection({
  hasContext,
  emailType,
  setEmailType,
  generatedEmail,
  emailPreviewMode,
  setEmailPreviewMode,
  onGenerate,
  isGenerating,
  copiedField,
  onCopy,
  selectedAccount,
  selectedContact,
}: EmailPreviewSectionProps) {
  return (
    <div className="h-full flex">
      {/* Config Panel */}
      <div className="w-72 border-r border-white/5 bg-black/10 p-4 overflow-y-auto">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-400" />
          Email Configuration
        </h3>

        <div className="space-y-2 mb-4">
          <Label className="text-xs font-medium text-white/50 uppercase">Email Type</Label>
          {EMAIL_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setEmailType(type.value)}
              className={cn(
                "w-full p-2 rounded-lg border text-left transition-all text-sm",
                emailType === type.value
                  ? "bg-blue-500/20 border-blue-500/50"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              )}
            >
              <span className="text-white">{type.label}</span>
              <p className="text-xs text-white/40">{type.description}</p>
            </button>
          ))}
        </div>

        <Separator className="bg-white/10 mb-4" />

        {hasContext && (
          <div className="space-y-2 mb-4">
            <Label className="text-xs font-medium text-white/50 uppercase">Variables</Label>
            {selectedAccount && (
              <div className="p-2 rounded bg-white/5 text-xs">
                <span className="text-white/50">Company:</span>
                <span className="text-white ml-1">{selectedAccount.name}</span>
              </div>
            )}
            {selectedContact && (
              <div className="p-2 rounded bg-white/5 text-xs">
                <span className="text-white/50">Contact:</span>
                <span className="text-white ml-1">{selectedContact.fullName}</span>
              </div>
            )}
          </div>
        )}

        <Button
          onClick={onGenerate}
          disabled={!hasContext || isGenerating}
          className="w-full bg-blue-500 hover:bg-blue-600"
        >
          {isGenerating ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating...</>
          ) : (
            <><Wand2 className="h-4 w-4 mr-2" />Generate Email</>
          )}
        </Button>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex flex-col">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-16 w-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Email Preview</h2>
              <p className="text-white/50 mb-4">Select a campaign and account to generate emails</p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign and Account required</span>
              </div>
            </div>
          </div>
        ) : !generatedEmail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Ready to Generate</h2>
              <p className="text-white/50">Click Generate Email to create a preview</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setEmailPreviewMode('preview')}
                  className={cn("px-3 py-1 rounded text-sm", emailPreviewMode === 'preview' ? "bg-blue-500 text-white" : "text-white/60")}
                >
                  <Eye className="h-3 w-3 inline mr-1" />Preview
                </button>
                <button
                  onClick={() => setEmailPreviewMode('html')}
                  className={cn("px-3 py-1 rounded text-sm", emailPreviewMode === 'html' ? "bg-blue-500 text-white" : "text-white/60")}
                >
                  {"</>"}
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={onGenerate} disabled={isGenerating} className="bg-white/5">
                <RefreshCw className={cn("h-3 w-3 mr-1", isGenerating && "animate-spin")} />
                Regenerate
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {emailPreviewMode === 'preview' ? (
                <div className="max-w-2xl mx-auto space-y-3">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-white/50">Subject</Label>
                      <Button variant="ghost" size="sm" onClick={() => onCopy(generatedEmail.subject, 'subject')} className="h-6 px-2">
                        {copiedField === 'subject' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <p className="text-white font-medium">{generatedEmail.subject}</p>
                  </div>
                  <div className="bg-white rounded-xl overflow-hidden">
                    {generatedEmail.html ? (
                      <iframe
                        srcDoc={generatedEmail.html}
                        className="w-full h-[400px] border-0"
                        title="Email Preview"
                      />
                    ) : (
                      <div className="p-6 text-gray-700">No preview available</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[#1e1e2e] rounded-xl border border-white/10">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                    <span className="text-xs text-white/50">HTML</span>
                    <Button variant="ghost" size="sm" onClick={() => onCopy(generatedEmail.html || '', 'html')} className="h-6 px-2 text-white/50">
                      {copiedField === 'html' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span className="ml-1 text-xs">Copy</span>
                    </Button>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <pre className="p-3 text-xs text-white/70 font-mono whitespace-pre-wrap">
                      {generatedEmail.html || 'No HTML'}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}