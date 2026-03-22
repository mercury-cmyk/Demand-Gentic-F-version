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
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
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
  Loader2,
  Brain,
  ShieldCheck,
  ShieldAlert,
  Target,
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

// Voice options - All 24 Gemini voices
const GEMINI_VOICES: VoiceOption[] = [
  // Primary B2B Sales voices
  { id: 'Kore', name: 'Kore', displayName: 'Kore', gender: 'female', personality: 'Firm, Professional, Confident', provider: 'gemini' },
  { id: 'Fenrir', name: 'Fenrir', displayName: 'Fenrir', gender: 'male', personality: 'Excitable, Energetic, Persuasive', provider: 'gemini' },
  { id: 'Charon', name: 'Charon', displayName: 'Charon', gender: 'male', personality: 'Informative, Authoritative, Knowledgeable', provider: 'gemini' },
  { id: 'Aoede', name: 'Aoede', displayName: 'Aoede', gender: 'female', personality: 'Breezy, Friendly, Light', provider: 'gemini' },
  { id: 'Puck', name: 'Puck', displayName: 'Puck', gender: 'male', personality: 'Upbeat, Lively, Engaging', provider: 'gemini' },
  // Professional voices
  { id: 'Zephyr', name: 'Zephyr', displayName: 'Zephyr', gender: 'male', personality: 'Bright, Clear, Articulate', provider: 'gemini' },
  { id: 'Leda', name: 'Leda', displayName: 'Leda', gender: 'female', personality: 'Youthful, Fresh, Modern', provider: 'gemini' },
  { id: 'Orus', name: 'Orus', displayName: 'Orus', gender: 'male', personality: 'Firm, Steady, Reliable', provider: 'gemini' },
  { id: 'Sulafat', name: 'Sulafat', displayName: 'Sulafat', gender: 'female', personality: 'Warm, Caring, Empathetic', provider: 'gemini' },
  { id: 'Gacrux', name: 'Gacrux', displayName: 'Gacrux', gender: 'male', personality: 'Mature, Experienced, Credible', provider: 'gemini' },
  { id: 'Schedar', name: 'Schedar', displayName: 'Schedar', gender: 'male', personality: 'Even, Balanced, Composed', provider: 'gemini' },
  { id: 'Achird', name: 'Achird', displayName: 'Achird', gender: 'female', personality: 'Friendly, Welcoming, Warm', provider: 'gemini' },
  // Specialized voices
  { id: 'Sadaltager', name: 'Sadaltager', displayName: 'Sadaltager', gender: 'male', personality: 'Knowledgeable, Expert, Authoritative', provider: 'gemini' },
  { id: 'Pulcherrima', name: 'Pulcherrima', displayName: 'Pulcherrima', gender: 'female', personality: 'Forward, Confident, Assertive', provider: 'gemini' },
  { id: 'Iapetus', name: 'Iapetus', displayName: 'Iapetus', gender: 'male', personality: 'Clear, Precise, Technical', provider: 'gemini' },
  { id: 'Erinome', name: 'Erinome', displayName: 'Erinome', gender: 'female', personality: 'Clear, Articulate, Professional', provider: 'gemini' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', displayName: 'Vindemiatrix', gender: 'female', personality: 'Gentle, Soft, Calming', provider: 'gemini' },
  { id: 'Achernar', name: 'Achernar', displayName: 'Achernar', gender: 'female', personality: 'Soft, Reassuring, Kind', provider: 'gemini' },
  // Dynamic voices
  { id: 'Sadachbia', name: 'Sadachbia', displayName: 'Sadachbia', gender: 'female', personality: 'Lively, Dynamic, Exciting', provider: 'gemini' },
  { id: 'Laomedeia', name: 'Laomedeia', displayName: 'Laomedeia', gender: 'female', personality: 'Upbeat, Positive, Motivating', provider: 'gemini' },
  // Character voices
  { id: 'Enceladus', name: 'Enceladus', displayName: 'Enceladus', gender: 'male', personality: 'Breathy, Intimate, Thoughtful', provider: 'gemini' },
  { id: 'Algenib', name: 'Algenib', displayName: 'Algenib', gender: 'male', personality: 'Gravelly, Deep, Distinctive', provider: 'gemini' },
  { id: 'Rasalgethi', name: 'Rasalgethi', displayName: 'Rasalgethi', gender: 'male', personality: 'Informative, Educational, Clear', provider: 'gemini' },
  { id: 'Alnilam', name: 'Alnilam', displayName: 'Alnilam', gender: 'male', personality: 'Firm, Decisive, Commanding', provider: 'gemini' },
];

const VOICE_TONES = [
  { value: 'professional', label: 'Professional', description: 'Formal and business-focused' },
  { value: 'consultative', label: 'Consultative', description: 'Advisory and helpful' },
  { value: 'confident', label: 'Confident', description: 'Direct and assertive' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'empathetic', label: 'Empathetic', description: 'Understanding and supportive' },
];

// ============== MAIN COMPONENT ==============

export default function PreviewStudioPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const campaignIdFromUrl = urlParams.get('campaignId');
  const { toast } = useToast();

  // Context selection
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignIdFromUrl);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);

  // Voice settings
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [voiceTone, setVoiceTone] = useState('professional');
  const [voiceSimStatus, setVoiceSimStatus] = useState('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState>([]);

  // Voice preview state
  const [previewingVoiceId, setPreviewingVoiceId] = useState(null);

  // Refs
  const playPreviewRef = useRef(null);

  // Update from URL
  useEffect(() => {
    if (campaignIdFromUrl && campaignIdFromUrl !== selectedCampaignId) {
      setSelectedCampaignId(campaignIdFromUrl);
    }
  }, [campaignIdFromUrl]);

  // Fetch campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns?limit=100');
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns || [];
    },
  });

  // Fetch campaign details with assigned voices
  interface CampaignDetails {
    id: string;
    name: string;
    assigned_voices?: Array | null;
  }
  const { data: campaignDetails } = useQuery({
    queryKey: ['/api/campaigns', selectedCampaignId, 'details'],
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      const res = await apiRequest('GET', `/api/campaigns/${selectedCampaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign details');
      return res.json();
    },
    enabled: !!selectedCampaignId,
  });

  // Determine available voices for the campaign
  const availableVoicesForCampaign = campaignDetails?.assigned_voices && Array.isArray(campaignDetails.assigned_voices) && campaignDetails.assigned_voices.length > 0
    ? GEMINI_VOICES.filter(v => campaignDetails.assigned_voices.some(av => av.id === v.id))
    : GEMINI_VOICES;

  // Auto-select first available voice if campaign changes
  useEffect(() => {
    if (campaignDetails?.assigned_voices && Array.isArray(campaignDetails.assigned_voices) && campaignDetails.assigned_voices.length > 0) {
      const firstAssignedVoiceId = campaignDetails.assigned_voices[0].id;
      if (selectedVoice !== firstAssignedVoiceId) {
        setSelectedVoice(firstAssignedVoiceId);
      }
    }
  }, [campaignDetails?.assigned_voices, selectedCampaignId]);

  // Fetch accounts for selected campaign
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['/api/knowledge-blocks/campaigns', selectedCampaignId, 'accounts'],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const res = await apiRequest('GET', `/api/knowledge-blocks/campaigns/${selectedCampaignId}/accounts`);
      const data = await res.json();
      return data.accounts || [];
    },
    enabled: !!selectedCampaignId,
  });

  // Fetch contacts for selected account
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ['/api/knowledge-blocks/accounts', selectedAccountId, 'contacts'],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const res = await apiRequest('GET', `/api/knowledge-blocks/accounts/${selectedAccountId}/contacts`);
      const data = await res.json();
      return (data.contacts || []).map((c: any) => ({
        id: c.id,
        fullName: c.firstName && c.lastName ? `${c.firstName} ${c.lastName}` : c.firstName || c.lastName || null,
        jobTitle: c.jobTitle,
        email: c.email,
      }));
    },
    enabled: !!selectedAccountId,
  });

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
      const response = await apiRequest('POST', '/api/voice-providers/preview', {
        voiceId: targetVoiceId,
        provider: 'gemini',
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

  // Intelligence status check — account intelligence is required; problem/org/solution are optional enhancements
  const { data: intelligenceStatus, isLoading: intelligenceLoading, refetch: refetchIntelligence } = useQuery({
    queryKey: ['/api/preview-studio/intelligence-status', selectedCampaignId, selectedAccountId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/preview-studio/intelligence-status?campaignId=${selectedCampaignId}&accountId=${selectedAccountId}`);
      if (!res.ok) throw new Error('Failed to check intelligence status');
      return res.json();
    },
    enabled: !!(selectedCampaignId && selectedAccountId),
    staleTime: 30000,
  });

  // Auto-generate intelligence mutation
  const generateIntelligenceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/preview-studio/intelligence-generate', {
        campaignId: selectedCampaignId,
        accountId: selectedAccountId,
      }, { timeout: 120000 });
      if (!res.ok) throw new Error('Failed to generate intelligence');
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchIntelligence();
      if (data?.success) {
        toast({ title: 'Intelligence Generated', description: 'Account intelligence has been generated successfully.' });
      } else {
        toast({ variant: 'destructive', title: 'Generation Incomplete', description: 'Intelligence generation did not fully complete. Some required components may still be missing.' });
      }
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    },
  });

  const intelligenceReady = intelligenceStatus?.ready ?? false;
  const hasBasicContext = !!(selectedCampaignId && selectedAccountId);
  const hasRequiredContext = hasBasicContext && intelligenceReady;
  const [, setLocation] = useLocation();

  return (
    
      {/* Gradient Background Effects */}
      
        
        
        
      

      {/* Header with Navigation */}
      
        
          {/* Breadcrumb Navigation */}
          
             setLocation('/dashboard')}
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
            >
              
              Home
            
            
             setLocation('/content-studio')}
              className="text-white/50 hover:text-white transition-colors"
            >
              Content Studio
            
            
            Preview Studio
          

          
            
              {/* Back Button */}
               window.history.back()}
                className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
              >
                
              
              
              
                
              
              
                Preview Studio
                Test voice experiences
              
            


          
        
      

      {/* Main Content - Full Height, No Scroll on Container */}
      
        {/* Left Panel - Context Selection (Compact) */}
        
          
            
              
              Context
            
          
          
          
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
                
              
            

          

          {/* Context Summary + Intelligence Status */}
          {hasBasicContext && (
            
              {/* Intelligence Gate Status */}
              {intelligenceLoading ? (
                
                  
                    
                    Checking intelligence...
                  
                
              ) : intelligenceReady ? (
                
                  
                    
                    {intelligenceStatus?.fullyEnriched ? 'Intelligence Ready' : 'Core Intelligence Ready'}
                  
                  
                    {[
                      { key: 'Account Intelligence', available: intelligenceStatus?.accountIntelligence?.available, icon: Brain, confidence: intelligenceStatus?.accountIntelligence?.confidence, required: true },
                      { key: 'Problem Intelligence', available: intelligenceStatus?.problemIntelligence?.available, icon: Zap, confidence: intelligenceStatus?.problemIntelligence?.confidence, required: false },
                      { key: 'Org Intelligence', available: intelligenceStatus?.organizationIntelligence?.available, icon: Building2, required: false },
                      { key: 'Solution Mapping', available: intelligenceStatus?.solutionMapping?.available, icon: Target, required: false },
                    ].map(item => (
                      
                        {item.available ?  : }
                        {item.key}{!item.available && !item.required ? ' (optional)' : ''}
                        {item.available && item.confidence ? (
                          {Math.round(item.confidence * 100)}%
                        ) : null}
                      
                    ))}
                  
                  
                    {selectedAccount?.name} {selectedContact && `• ${selectedContact.fullName}`}
                  
                
              ) : (
                
                  
                    
                    Intelligence Required
                  
                  
                    {[
                      { key: 'Account Intelligence', available: intelligenceStatus?.accountIntelligence?.available, icon: Brain, required: true },
                      { key: 'Problem Intelligence', available: intelligenceStatus?.problemIntelligence?.available, icon: Zap, required: false },
                      { key: 'Org Intelligence', available: intelligenceStatus?.organizationIntelligence?.available, icon: Building2, required: false },
                      { key: 'Solution Mapping', available: intelligenceStatus?.solutionMapping?.available, icon: Target, required: false },
                    ].map(item => (
                      
                        {item.available ?  : item.required ?  : }
                        {item.key}{!item.available && !item.required ? ' (optional)' : ''}
                      
                    ))}
                  
                  {(intelligenceStatus?.missingRequiredComponents?.length || intelligenceStatus?.missingComponents?.includes('Account Intelligence')) && (
                     generateIntelligenceMutation.mutate()}
                      disabled={generateIntelligenceMutation.isPending}
                      className="w-full mt-2 h-7 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
                    >
                      {generateIntelligenceMutation.isPending ? (
                        <>Generating Intelligence...
                      ) : (
                        <>Generate Missing Intelligence
                      )}
                    
                  )}
                  
                    Account intelligence is required. Problem, Org, and Solution Mapping improve quality but do not block previews.
                  
                
              )}
            
          )}
        

        {/* Main Preview Area */}
        
           0 : false}
          />
        
      
    
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
  onPreviewVoice: (voiceId?: string) => void;
  previewingVoiceId: string | null;
  voiceSimStatus: 'idle' | 'connecting' | 'active' | 'completed';
  setVoiceSimStatus: (s: 'idle' | 'connecting' | 'active' | 'completed') => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  voiceTranscripts: Array;
  setVoiceTranscripts: (t: Array) => void;
  campaignId: string | null;
  accountId: string | null;
  contactId: string | null;
  availableVoices: VoiceOption[];
  campaignHasConfiguredVoices: boolean;
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
  setVoiceTranscripts,
  campaignId,
  accountId,
  contactId,
  availableVoices,
  campaignHasConfiguredVoices,
}: VoicePreviewSectionProps) {
  const maleVoices = availableVoices.filter(v => v.gender === 'male');
  const femaleVoices = availableVoices.filter(v => v.gender === 'female');

  return (
    
      {/* Voice Configuration Panel */}
      
        
          
            
              
            
            Voice Configuration
          
          
            {campaignHasConfiguredVoices 
              ? `${availableVoices.length} campaign voice${availableVoices.length !== 1 ? 's' : ''} assigned` 
              : '24 Gemini voices available'}
          
          {campaignHasConfiguredVoices && (
            
              
              Using campaign voice pool
            
          )}
        

        
        {/* Gender Selection with Voice Cards */}
        
          {/* MALE VOICES */}
          
            
              
              Male Voices
            
            
              {maleVoices.map(voice => (
                 setSelectedVoice(voice.id)}
                  className={cn(
                    "group relative p-3 rounded-xl border text-left transition-all duration-300 cursor-pointer",
                    selectedVoice === voice.id
                      ? "bg-gradient-to-r from-blue-500/20 to-cyan-500/10 border-blue-500/50 shadow-lg shadow-blue-500/10 transform scale-[1.02]"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-md"
                  )}
                >
                  
                     
                        
                          {voice.displayName.charAt(0)}
                        
                        
                           {voice.displayName}
                           {voice.gender}
                        
                     
                     
                         { e.stopPropagation(); onPreviewVoice(voice.id); }}
                          disabled={previewingVoiceId === voice.id}
                          className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200",
                            previewingVoiceId === voice.id
                              ? "bg-blue-500/30 border border-blue-400/50"
                              : "bg-white/10 hover:bg-blue-500/30 border border-transparent hover:border-blue-400/50 opacity-0 group-hover:opacity-100",
                            selectedVoice === voice.id && "opacity-100"
                          )}
                          title={`Preview ${voice.displayName}`}
                        >
                          {previewingVoiceId === voice.id ? (
                            
                          ) : (
                            
                          )}
                        
                        {selectedVoice === voice.id && (
                          
                            
                          
                        )}
                     
                  
                  
                    {voice.personality.split(',').map((tag, i) => (
                      
                        {tag.trim()}
                      
                    ))}
                  
                
              ))}
            
          

          {/* FEMALE VOICES */}
          
            
              
              Female Voices
            
            
              {femaleVoices.map(voice => (
                 setSelectedVoice(voice.id)}
                  className={cn(
                    "group relative p-3 rounded-xl border text-left transition-all duration-300 cursor-pointer",
                    selectedVoice === voice.id
                      ? "bg-gradient-to-r from-pink-500/20 to-purple-500/10 border-pink-500/50 shadow-lg shadow-pink-500/10 transform scale-[1.02]"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:shadow-md"
                  )}
                >
                  
                     
                        
                          {voice.displayName.charAt(0)}
                        
                        
                           {voice.displayName}
                           {voice.gender}
                        
                     
                     
                         { e.stopPropagation(); onPreviewVoice(voice.id); }}
                          disabled={previewingVoiceId === voice.id}
                          className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200",
                            previewingVoiceId === voice.id
                              ? "bg-pink-500/30 border border-pink-400/50"
                              : "bg-white/10 hover:bg-pink-500/30 border border-transparent hover:border-pink-400/50 opacity-0 group-hover:opacity-100",
                            selectedVoice === voice.id && "opacity-100"
                          )}
                          title={`Preview ${voice.displayName}`}
                        >
                          {previewingVoiceId === voice.id ? (
                            
                          ) : (
                            
                          )}
                        
                        {selectedVoice === voice.id && (
                          
                            
                          
                        )}
                     
                  
                  
                    {voice.personality.split(',').map((tag, i) => (
                      
                        {tag.trim()}
                      
                    ))}
                  
                
              ))}
            
          
        

        

        {/* Personality & Tone */}
        
          Voice Personality
          
            {VOICE_TONES.map(tone => (
               setVoiceTone(tone.value)}
                className={cn(
                  "w-full p-3 rounded-xl border text-left transition-all duration-200",
                  voiceTone === tone.value
                    ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/50"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                )}
              >
                
                  {tone.label}
                  {voiceTone === tone.value && }
                
                {tone.description}
              
            ))}
          
        
        
      

      {/* Voice Simulation Area */}
      
        {!hasContext ? (
          
            
              
                
              
              Voice Preview
              
                Select a campaign and account to start testing voice interactions with real context
              
              
                
                Campaign and Account required
              
            
          
        ) : (
          <>
            {/* Voice Call Controls */}
            
              
                
                  
                    {voiceSimStatus === 'active' ? (
                      
                    ) : voiceSimStatus === 'connecting' ? (
                      
                    ) : (
                      
                    )}
                  
                  
                    
                      {voiceSimStatus === 'active' ? 'Call in Progress' 
                        : voiceSimStatus === 'connecting' ? 'Connecting...'
                        : voiceSimStatus === 'completed' ? 'Call Ended'
                        : 'Ready to Call'}
                    
                    
                      {selectedVoiceInfo?.displayName} • {VOICE_TONES.find(t => t.value === voiceTone)?.label}
                    
                  
                

                
                  {voiceSimStatus === 'active' && (
                     setIsMuted(!isMuted)}
                      className={cn(
                        "h-12 w-12 rounded-xl transition-all",
                        isMuted ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-white/5 border-white/10 text-white"
                      )}
                    >
                      {isMuted ?  : }
                    
                  )}

                  {voiceSimStatus === 'idle' || voiceSimStatus === 'completed' ? (
                     setVoiceSimStatus('connecting')}
                      className="h-12 px-8 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                    >
                      
                      Start Voice Test
                    
                  ) : (
                     setVoiceSimStatus('completed')}
                      variant="destructive"
                      className="h-12 px-8 rounded-xl"
                    >
                      
                      End Call
                    
                  )}
                
              
            

            {/* Transcript Area */}
            
              
                
                  Live Transcript
                  {voiceSimStatus === 'active' && (
                    
                      
                      Recording
                    
                  )}
                
                
                  {voiceTranscripts.length === 0 ? (
                    
                      
                      
                        {voiceSimStatus === 'idle' 
                          ? 'Start a voice test to see the transcript'
                          : 'Waiting for conversation...'}
                      
                    
                  ) : (
                    
                      {voiceTranscripts.map((entry, i) => (
                        
                          
                            {entry.content}
                          
                        
                      ))}
                    
                  )}
                
              
            
          
        )}
      
    
  );
}