import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
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
  ArrowLeft,
  Home,
  Wand2,
  Send,
  Eye,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Radio,
  Zap,
  MessageSquare,
} from "lucide-react";
import { PageLayout, PageHeader, PageContent } from "@/components/layout/page-layout";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ============== TYPES ==============

interface VoiceOption {
  id: string;
  name: string;
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  personality: string;
  provider: 'gemini' | 'openai';
}

interface Account {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
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

// Voice options with personalities
const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Puck', name: 'Puck', displayName: 'Puck', gender: 'male', personality: 'Natural, Soft, Storytelling', provider: 'gemini' },
  { id: 'Charon', name: 'Charon', displayName: 'Charon', gender: 'male', personality: 'Deep, Resonant, Authoritative', provider: 'gemini' },
  { id: 'Kore', name: 'Kore', displayName: 'Kore', gender: 'female', personality: 'Balanced, Clear, Professional', provider: 'gemini' },
  { id: 'Fenrir', name: 'Fenrir', displayName: 'Fenrir', gender: 'male', personality: 'Deep, Intense, Cinematic', provider: 'gemini' },
  { id: 'Aoede', name: 'Aoede', displayName: 'Aoede', gender: 'female', personality: 'Bright, Expressive, Engaging', provider: 'gemini' },
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

// ============== MAIN COMPONENT ==============

export default function PreviewStudioPage() {
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
  }, [campaignIdFromUrl]);

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns?limit=100');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Fetch accounts for selected campaign
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['/api/preview-studio/accounts', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const res = await apiRequest('GET', `/api/preview-studio/accounts?campaignId=${selectedCampaignId}`);
      return res.json();
    },
    enabled: !!selectedCampaignId,
  });

  // Fetch contacts for selected account
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/preview-studio/contacts', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const res = await apiRequest('GET', `/api/preview-studio/contacts?accountId=${selectedAccountId}`);
      return res.json();
    },
    enabled: !!selectedAccountId,
  });

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
      const response = await apiRequest('POST', '/api/voice-providers/preview', {
        voiceId: selectedVoice,
        provider: 'gemini',
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
      const res = await apiRequest('POST', '/api/preview-studio/generate-email', {
        campaignId: selectedCampaignId,
        accountId: selectedAccountId,
        contactId: selectedContactId,
        emailType,
      });
      if (!res.ok) throw new Error('Failed to generate email');
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
  const [, setLocation] = useLocation();

  return (
    <PageLayout className="bg-[#0a0a0f] h-screen overflow-hidden">
      {/* Gradient Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header with Navigation */}
      <div className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="px-6 py-4">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm mb-3">
            <button 
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Home</span>
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-white/30" />
            <button 
              onClick={() => setLocation('/content-studio')}
              className="text-white/50 hover:text-white transition-colors"
            >
              Content Studio
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-white/30" />
            <span className="text-white font-medium">Preview Studio</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => window.history.back()}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              
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

      {/* Main Content - Full Height, No Scroll on Container */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left Panel - Context Selection (Compact) */}
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
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white focus:bg-white/10">
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
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-white focus:bg-white/10">
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
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-white focus:bg-white/10">
                      <div className="flex flex-col">
                        <span>{c.fullName || c.email}</span>
                        {c.jobTitle && <span className="text-xs text-white/40">{c.jobTitle}</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scenario (compact) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Scenario</Label>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {SCENARIOS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-white focus:bg-white/10">
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
              setVoiceTranscripts={setVoiceTranscripts}
              campaignId={selectedCampaignId}
              accountId={selectedAccountId}
              contactId={selectedContactId}
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
    </PageLayout>
  );
}

// ============== VOICE PREVIEW SECTION ==============

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
  setVoiceTranscripts: (t: Array<{ role: string; content: string; timestamp: Date }>) => void;
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
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
  setVoiceTranscripts,
  campaignId,
  accountId,
  contactId,
}: VoicePreviewSectionProps) {
  const maleVoices = GEMINI_VOICES.filter(v => v.gender === 'male');
  const femaleVoices = GEMINI_VOICES.filter(v => v.gender === 'female');

  return (
    <div className="h-full flex">
      {/* Voice Configuration Panel */}
      <div className="w-80 border-r border-white/5 bg-black/10 p-6 overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Volume2 className="h-4 w-4 text-purple-400" />
          </div>
          Voice Configuration
        </h3>

        {/* Gender Selection with Voice Cards */}
        <div className="space-y-6 mb-6">
          {/* MALE VOICES */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              Male Voices
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {maleVoices.map(voice => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "group relative p-3 rounded-xl border text-left transition-all duration-300",
                    selectedVoice === voice.id
                      ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10 transform scale-[1.02]"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-md"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                     <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shadow-inner",
                          selectedVoice === voice.id 
                            ? "bg-gradient-to-br from-blue-500 to-cyan-600 text-white" 
                            : "bg-white/10 text-white/40 group-hover:bg-white/20 group-hover:text-white/70"
                        )}>
                          {voice.displayName.charAt(0)}
                        </div>
                        <div>
                           <span className={cn(
                             "text-sm font-semibold block transition-colors",
                             selectedVoice === voice.id ? "text-white" : "text-white/80 group-hover:text-white"
                           )}>{voice.displayName}</span>
                           <span className={cn(
                             "text-xs block capitalize",
                             selectedVoice === voice.id ? "text-blue-300" : "text-white/30"
                           )}>{voice.gender}</span>
                        </div>
                     </div>
                     {selectedVoice === voice.id && (
                        <div className="h-6 w-6 rounded-full bg-blue-500/20 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                     )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {voice.personality.split(',').map((tag, i) => (
                      <span key={i} className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-md border",
                         selectedVoice === voice.id
                           ? "bg-blue-500/10 border-blue-500/20 text-blue-200"
                           : "bg-white/5 border-white/5 text-white/40"
                      )}>
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* FEMALE VOICES */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-pink-500"></span>
              Female Voices
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {femaleVoices.map(voice => (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "group relative p-3 rounded-xl border text-left transition-all duration-300",
                    selectedVoice === voice.id
                      ? "bg-gradient-to-r from-pink-500/20 to-purple-500/10 border-pink-500/50 shadow-lg shadow-pink-500/10 transform scale-[1.02]"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-md"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                     <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shadow-inner",
                          selectedVoice === voice.id 
                            ? "bg-gradient-to-br from-pink-500 to-purple-600 text-white" 
                            : "bg-white/10 text-white/40 group-hover:bg-white/20 group-hover:text-white/70"
                        )}>
                          {voice.displayName.charAt(0)}
                        </div>
                        <div>
                           <span className={cn(
                             "text-sm font-semibold block transition-colors",
                             selectedVoice === voice.id ? "text-white" : "text-white/80 group-hover:text-white"
                           )}>{voice.displayName}</span>
                           <span className={cn(
                             "text-xs block capitalize",
                             selectedVoice === voice.id ? "text-pink-300" : "text-white/30"
                           )}>{voice.gender}</span>
                        </div>
                     </div>
                     {selectedVoice === voice.id && (
                        <div className="h-6 w-6 rounded-full bg-pink-500/20 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                          <CheckCircle2 className="h-3.5 w-3.5 text-pink-400" />
                        </div>
                     )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {voice.personality.split(',').map((tag, i) => (
                      <span key={i} className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-md border",
                         selectedVoice === voice.id
                           ? "bg-pink-500/10 border-pink-500/20 text-pink-200"
                           : "bg-white/5 border-white/5 text-white/40"
                      )}>
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Voice Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onPreviewVoice}
          className="w-full mb-6 bg-white/5 border-white/10 text-white hover:bg-white/10"
        >
          <Play className="h-4 w-4 mr-2" />
          Preview {selectedVoiceInfo?.displayName || 'Voice'}
        </Button>

        <Separator className="bg-white/10 mb-6" />

        {/* Personality & Tone */}
        <div className="space-y-4">
          <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Voice Personality</Label>
          <div className="space-y-2">
            {VOICE_TONES.map(tone => (
              <button
                key={tone.value}
                onClick={() => setVoiceTone(tone.value)}
                className={cn(
                  "w-full p-3 rounded-xl border text-left transition-all duration-200",
                  voiceTone === tone.value
                    ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/50"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{tone.label}</span>
                  {voiceTone === tone.value && <CheckCircle2 className="h-4 w-4 text-purple-400" />}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{tone.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Voice Simulation Area */}
      <div className="flex-1 flex flex-col">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Phone className="h-10 w-10 text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Voice Preview</h2>
              <p className="text-white/50 mb-6">
                Select a campaign and account to start testing voice interactions with real context
              </p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign and Account required</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Voice Call Controls */}
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-300",
                    voiceSimStatus === 'active'
                      ? "bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30 animate-pulse"
                      : voiceSimStatus === 'connecting'
                        ? "bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg shadow-yellow-500/30"
                        : "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10"
                  )}>
                    {voiceSimStatus === 'active' ? (
                      <Radio className="h-8 w-8 text-white" />
                    ) : voiceSimStatus === 'connecting' ? (
                      <RefreshCw className="h-8 w-8 text-white animate-spin" />
                    ) : (
                      <PhoneCall className="h-8 w-8 text-purple-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {voiceSimStatus === 'active' ? 'Call in Progress' 
                        : voiceSimStatus === 'connecting' ? 'Connecting...'
                        : voiceSimStatus === 'completed' ? 'Call Ended'
                        : 'Ready to Call'}
                    </h3>
                    <p className="text-sm text-white/50">
                      {selectedVoiceInfo?.displayName} • {VOICE_TONES.find(t => t.value === voiceTone)?.label}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {voiceSimStatus === 'active' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsMuted(!isMuted)}
                      className={cn(
                        "h-12 w-12 rounded-xl transition-all",
                        isMuted ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-white/5 border-white/10 text-white"
                      )}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                  )}

                  {voiceSimStatus === 'idle' || voiceSimStatus === 'completed' ? (
                    <Button
                      onClick={() => setVoiceSimStatus('connecting')}
                      className="h-12 px-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                    >
                      <Phone className="h-5 w-5 mr-2" />
                      Start Voice Test
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setVoiceSimStatus('completed')}
                      variant="destructive"
                      className="h-12 px-8 rounded-xl"
                    >
                      <Square className="h-5 w-5 mr-2" />
                      End Call
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Transcript Area */}
            <div className="flex-1 p-6 overflow-hidden">
              <div className="h-full bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white/70">Live Transcript</h4>
                  {voiceSimStatus === 'active' && (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse mr-2" />
                      Recording
                    </Badge>
                  )}
                </div>
                <ScrollArea className="flex-1 p-4">
                  {voiceTranscripts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <MessageSquare className="h-12 w-12 text-white/20 mb-4" />
                      <p className="text-white/40">
                        {voiceSimStatus === 'idle' 
                          ? 'Start a voice test to see the transcript'
                          : 'Waiting for conversation...'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {voiceTranscripts.map((entry, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3",
                            entry.role === 'user' ? "justify-end" : "justify-start"
                          )}
                        >
                          <div className={cn(
                            "max-w-[80%] p-4 rounded-2xl",
                            entry.role === 'user'
                              ? "bg-purple-500/20 text-white rounded-br-md"
                              : "bg-white/10 text-white rounded-bl-md"
                          )}>
                            <p className="text-sm">{entry.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============== EMAIL PREVIEW SECTION ==============

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

const EMAIL_TYPES = [
  { value: 'cold_outreach', label: 'Cold Outreach', description: 'First touch to prospects' },
  { value: 'follow_up', label: 'Follow Up', description: 'After initial contact' },
  { value: 'meeting_request', label: 'Meeting Request', description: 'Request for a call' },
  { value: 'nurture', label: 'Nurture', description: 'Value-add content' },
  { value: 'breakup', label: 'Breakup', description: 'Final outreach' },
];

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
      {/* Email Configuration Panel */}
      <div className="w-80 border-r border-white/5 bg-black/10 p-6 overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Mail className="h-4 w-4 text-blue-400" />
          </div>
          Email Configuration
        </h3>

        {/* Email Type Selection */}
        <div className="space-y-4 mb-6">
          <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Email Type</Label>
          <div className="space-y-2">
            {EMAIL_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => setEmailType(type.value)}
                className={cn(
                  "w-full p-3 rounded-xl border text-left transition-all duration-200",
                  emailType === type.value
                    ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/50"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{type.label}</span>
                  {emailType === type.value && <CheckCircle2 className="h-4 w-4 text-blue-400" />}
                </div>
                <p className="text-xs text-white/40 mt-0.5">{type.description}</p>
              </button>
            ))}
          </div>
        </div>

        <Separator className="bg-white/10 mb-6" />

        {/* Context Variables Preview */}
        {hasContext && (
          <div className="space-y-3 mb-6">
            <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Applied Variables</Label>
            <div className="space-y-2 text-sm">
              {selectedAccount && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                  <Building2 className="h-4 w-4 text-blue-400" />
                  <span className="text-white/70">{`{{company}}`}</span>
                  <ChevronRight className="h-3 w-3 text-white/30" />
                  <span className="text-white">{selectedAccount.name}</span>
                </div>
              )}
              {selectedContact && (
                <>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <User className="h-4 w-4 text-cyan-400" />
                    <span className="text-white/70">{`{{first_name}}`}</span>
                    <ChevronRight className="h-3 w-3 text-white/30" />
                    <span className="text-white">{selectedContact.fullName?.split(' ')[0] || 'Contact'}</span>
                  </div>
                  {selectedContact.jobTitle && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                      <Zap className="h-4 w-4 text-yellow-400" />
                      <span className="text-white/70">{`{{title}}`}</span>
                      <ChevronRight className="h-3 w-3 text-white/30" />
                      <span className="text-white truncate">{selectedContact.jobTitle}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={onGenerate}
          disabled={!hasContext || isGenerating}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg shadow-blue-500/25"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              Generate Email
            </>
          )}
        </Button>
      </div>

      {/* Email Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasContext ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Mail className="h-10 w-10 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Email Preview</h2>
              <p className="text-white/50 mb-6">
                Select a campaign and account to generate personalized email previews
              </p>
              <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Campaign and Account required</span>
              </div>
            </div>
          </div>
        ) : !generatedEmail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-6 border border-white/10">
                <Sparkles className="h-10 w-10 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Ready to Generate</h2>
              <p className="text-white/50">
                Click "Generate Email" to create a personalized email with account context
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Preview Mode Toggle */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setEmailPreviewMode('preview')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    emailPreviewMode === 'preview'
                      ? "bg-blue-500 text-white"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  <Eye className="h-4 w-4 inline mr-2" />
                  Preview
                </button>
                <button
                  onClick={() => setEmailPreviewMode('html')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    emailPreviewMode === 'html'
                      ? "bg-blue-500 text-white"
                      : "text-white/60 hover:text-white"
                  )}
                >
                  {"</>"}
                  <span className="ml-2">HTML</span>
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={onGenerate}
                disabled={isGenerating}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isGenerating && "animate-spin")} />
                Regenerate
              </Button>
            </div>

            {/* Email Content - LARGER PREVIEW */}
            <div className="flex-1 p-6 overflow-auto">
              {emailPreviewMode === 'preview' ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Subject Line */}
                  <div className="bg-white/5 rounded-2xl border border-white/10 p-5">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-medium text-white/50 uppercase tracking-wider">Subject Line</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy(generatedEmail.subject, 'subject')}
                        className="h-8 text-white/50 hover:text-white"
                      >
                        {copiedField === 'subject' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-lg font-medium text-white">{generatedEmail.subject}</p>
                    {generatedEmail.preheader && (
                      <p className="text-sm text-white/50 mt-2">{generatedEmail.preheader}</p>
                    )}
                  </div>

                  {/* Email Body Preview */}
                  <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
                    {generatedEmail.html ? (
                      <iframe
                        srcDoc={generatedEmail.html}
                        className="w-full h-[600px] border-0"
                        title="Email Preview"
                      />
                    ) : (
                      <div className="p-8">
                        {generatedEmail.heroTitle && (
                          <h2 className="text-2xl font-bold text-gray-900 mb-2">{generatedEmail.heroTitle}</h2>
                        )}
                        {generatedEmail.heroSubtitle && (
                          <p className="text-gray-600 mb-6">{generatedEmail.heroSubtitle}</p>
                        )}
                        {generatedEmail.intro && (
                          <p className="text-gray-700 mb-6 leading-relaxed">{generatedEmail.intro}</p>
                        )}
                        {generatedEmail.valueBullets && (
                          <ul className="list-disc list-inside space-y-2 mb-6 text-gray-700">
                            {generatedEmail.valueBullets.map((bullet: string, i: number) => (
                              <li key={i}>{bullet}</li>
                            ))}
                          </ul>
                        )}
                        {generatedEmail.ctaLabel && (
                          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium">
                            {generatedEmail.ctaLabel}
                          </button>
                        )}
                        {generatedEmail.closingLine && (
                          <p className="text-gray-600 mt-6 italic">{generatedEmail.closingLine}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <div className="bg-[#1e1e2e] rounded-2xl border border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                      <span className="text-sm text-white/50">HTML Source</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopy(generatedEmail.html || '', 'html')}
                        className="h-8 text-white/50 hover:text-white"
                      >
                        {copiedField === 'html' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                        Copy HTML
                      </Button>
                    </div>
                    <ScrollArea className="h-[600px]">
                      <pre className="p-4 text-sm text-white/80 font-mono whitespace-pre-wrap">
                        {generatedEmail.html || 'No HTML content available'}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
