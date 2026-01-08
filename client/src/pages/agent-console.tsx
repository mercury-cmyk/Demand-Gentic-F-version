import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff,
  Clock,
  User,
  Building2,
  FileText,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Mail,
  Briefcase,
  Zap,
  CheckCircle2,
  ExternalLink,
  Linkedin,
  MessageSquare,
  Target,
  Lightbulb,
  Sparkles,
  Hash,
  Settings,
  Volume2,
  Circle,
  ArrowRight,
  Star,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { useAuth } from "@/contexts/AuthContext";
import type { CallState } from "@/hooks/useTelnyxWebRTC";
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CONTACT_FIELD_LABELS, ACCOUNT_FIELD_LABELS } from '@shared/field-labels';
import { QueueControls } from "@/components/queue-controls";
import { AudioDeviceSettings } from "@/components/audio-device-settings";
import { ContactMismatchDialog } from "@/components/contact-mismatch-dialog";
import { LeadVerificationModal } from "@/components/lead-verification-modal";

// Backwards compatibility type alias
type CallStatus = CallState | 'wrap-up';

// Helper function to validate and normalize phone number to E.164
function normalizePhoneToE164(phone: string | null, country: string = 'US'): string | null {
  if (!phone) return null;

  let cleanedPhone = phone.trim();

  // CRITICAL FIX: UK numbers with leading 0 after country code (+440...)
  // These calls will NOT connect - the 0 must be removed after +44
  // Examples: +4401234567890 → +441234567890, +447012345678 → +447012345678
  if (cleanedPhone.match(/^\+440\d{10,}$/)) {
    // Remove the 0 after +44
    cleanedPhone = '+44' + cleanedPhone.substring(4);
    console.log('🔧 Fixed UK number: removed leading 0 after +44:', cleanedPhone);
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(cleanedPhone, country as any);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number;
    }
  } catch (error) {
    console.error('Phone normalization error:', error);
  }

  return null;
}

// Get phone type label using standardized field labels
function getPhoneTypeLabel(phoneType: 'direct' | 'mobile' | 'hq' | null): string {
  switch (phoneType) {
    case 'direct':
      return CONTACT_FIELD_LABELS.directPhone; // "Contact_Phone"
    case 'mobile':
      return CONTACT_FIELD_LABELS.mobilePhone; // "Contact_Mobile"
    case 'hq':
      return ACCOUNT_FIELD_LABELS.mainPhone; // "Company_Main_Phone"
    default:
      return 'Phone';
  }
}

// Contact type with additional fields
type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string;
  directPhone: string | null;
  mobilePhone: string | null;
  jobTitle: string | null;
  accountId: string | null;
  account?: {
    id: string;
    name: string;
    mainPhone: string | null;
  } | null;
};

// Queue item type
type QueueItem = {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  phoneType: 'direct' | 'mobile' | 'hq' | null;
  accountId: string;
  accountName: string | null;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

// Campaign type for selector
type Campaign = {
  id: string;
  name: string;
  type?: 'email' | 'call' | 'combo';
};

export default function AgentConsolePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [selectedPhoneType, setSelectedPhoneType] = useState<'direct' | 'company' | 'manual'>('direct');
  const [manualPhoneNumber, setManualPhoneNumber] = useState<string>('');
  const [showManualDial, setShowManualDial] = useState(false);
  const [dialedPhoneNumber, setDialedPhoneNumber] = useState<string>(''); // Track actual dialed number

  // Disposition form state
  const [disposition, setDisposition] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [qualificationData, setQualificationData] = useState<any>({});
  const [dispositionSaved, setDispositionSaved] = useState(false);
  const [callMadeToContact, setCallMadeToContact] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);

  // Contact Mismatch (Wrong Person Answered) state
  const [showContactMismatch, setShowContactMismatch] = useState(false);
  const [switchedContact, setSwitchedContact] = useState<{ id: string; fullName: string } | null>(null);
  const [activeCallAttemptId, setActiveCallAttemptId] = useState<string | null>(null);

  // Lead Verification Modal state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationLeadId, setVerificationLeadId] = useState<string | null>(null);

  // Fetch SIP trunk credentials
  const { data: sipConfig } = useQuery<{
    sipUsername: string; 
    sipPassword: string; 
    sipDomain?: string;
    callerIdNumber?: string;
  }>({
    queryKey: ['/api/sip-trunks/default'],
  });

  // Debug SIP config
  useEffect(() => {
    console.log('SIP Config received:', {
      hasSipConfig: !!sipConfig,
      hasUsername: !!sipConfig?.sipUsername,
      hasPassword: !!sipConfig?.sipPassword,
      username: sipConfig?.sipUsername,
      domain: sipConfig?.sipDomain,
    });
  }, [sipConfig]);

  // Fetch agent's active campaign assignment
  const { data: activeCampaign } = useQuery<{
    campaignId: string;
    campaignName: string;
    assignedAt: Date;
  } | null>({
    queryKey: ['/api/agents/me/active-campaign'],
  });

  // Automatically select the active campaign when it's loaded
  useEffect(() => {
    if (activeCampaign?.campaignId && !selectedCampaignId) {
      console.log('[AGENT CONSOLE] Auto-selecting active campaign:', activeCampaign.campaignId);
      setSelectedCampaignId(activeCampaign.campaignId);
    }
  }, [activeCampaign, selectedCampaignId]);

  // CRITICAL FIX: Reset contact index when campaign changes
  // This prevents showing stale contacts from the previous queue
  useEffect(() => {
    console.log('[AGENT CONSOLE] Campaign changed, resetting contact index to 0');
    setCurrentContactIndex(0);
  }, [selectedCampaignId]);

  // Initialize Telnyx WebRTC
  const {
    callState,
    isConnected,
    isMuted,
    callDuration,
    lastError,
    telnyxCallId,
    selectedMicId,
    selectedSpeakerId,
    formatDuration,
    makeCall,
    hangup,
    toggleMute,
    sendDTMF,
    setAudioDevices,
  } = useTelnyxWebRTC({
    sipUsername: sipConfig?.sipUsername,
    sipPassword: sipConfig?.sipPassword,
    sipDomain: sipConfig?.sipDomain || 'sip.telnyx.com',
    onCallStateChange: (state) => {
      if (state === 'hangup') {
        setCallStatus('wrap-up');
      } else {
        setCallStatus(state as CallStatus);
      }
    },
    onCallEnd: () => {
      setCallStatus('wrap-up');
    },
  });

  // Fetch agent queue data
  const { data: queueData = [], isLoading: queueLoading, refetch: refetchQueue, error: queueError, isFetching: queueFetching } = useQuery<QueueItem[]>({
    queryKey: selectedCampaignId 
      ? [`/api/agents/me/queue?campaignId=${selectedCampaignId}&status=queued`]
      : ['/api/agents/me/queue?status=queued'],
    placeholderData: undefined, // Clear old queue data immediately when campaign changes
  });

  // Debug queue data
  useEffect(() => {
    console.log('[AGENT CONSOLE] Queue state:', {
      queueDataLength: queueData?.length ?? 'undefined',
      queueLoading,
      queueFetching,
      queueError: queueError?.message ?? null,
      selectedCampaignId,
      firstItem: queueData?.[0] ?? null,
    });
  }, [queueData, queueLoading, queueFetching, queueError, selectedCampaignId]);

  // Fetch contact details for current contact
  const currentQueueItem = queueData[currentContactIndex];
  const { data: contactDetails } = useQuery<Contact>({
    queryKey: currentQueueItem ? [`/api/contacts/${currentQueueItem.contactId}`] : [],
    enabled: !!currentQueueItem?.contactId,
  });

  // Compute valid phone options from queue item (already has best phone selected)
  const validPhoneOptions = useMemo(() => {
    if (!currentQueueItem?.contactPhone) return [];

    const options: Array<{ type: 'direct' | 'company' | 'manual'; number: string; label: string }> = [];

    // Queue already provides the best phone and its type
    const phoneLabel = currentQueueItem.phoneType 
      ? getPhoneTypeLabel(currentQueueItem.phoneType)
      : 'Phone';

    options.push({
      type: currentQueueItem.phoneType === 'hq' ? 'company' : 'direct',
      number: currentQueueItem.contactPhone,
      label: `${phoneLabel}: ${currentQueueItem.contactPhone}`
    });

    return options;
  }, [currentQueueItem]);

  // Auto-select first valid phone number when contact changes
  useEffect(() => {
    if (validPhoneOptions.length > 0) {
      setSelectedPhoneType(validPhoneOptions[0].type);
      setShowManualDial(false);
      setManualPhoneNumber('');
    } else {
      setSelectedPhoneType('manual');
      setShowManualDial(true);
    }
  }, [validPhoneOptions]);

  // Fetch campaign details
  const { data: campaignDetails } = useQuery<{
    id: string;
    name: string;
    dialMode?: 'manual' | 'hybrid' | 'ai_agent';
    callScript?: string;
    scriptId?: string | null;
    qualificationQuestions?: Array<{
      id: string;
      label: string;
      type: 'select' | 'text' | 'number';
      options?: Array<{ value: string; label: string }>;
      required?: boolean;
    }>;
    hybridSettings?: {
      amd?: {
        enabled: boolean;
        confidenceThreshold: number;
      };
      voicemailPolicy?: {
        enabled: boolean;
      };
    };
  }>({
    queryKey: selectedCampaignId ? [`/api/campaigns/${selectedCampaignId}`] : [],
    enabled: !!selectedCampaignId,
  });

  // Fetch assigned call script if scriptId is present
  const { data: assignedScript } = useQuery<{
    id: string;
    name: string;
    content: string;
    version: number;
  }>({
    queryKey: campaignDetails?.scriptId ? [`/api/call-scripts/${campaignDetails.scriptId}`] : [],
    enabled: !!campaignDetails?.scriptId,
  });

  // Fetch full contact details for the current queue item
  const { data: fullContactDetails } = useQuery<{
    id: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    directPhone: string | null;
    mobilePhone: string | null;
    jobTitle: string | null;
    department: string | null;
    seniorityLevel: string | null;
    city: string | null;
    state: string | null;
    county: string | null;
    postalCode: string | null;
    country: string | null;
    linkedinUrl: string | null;
    formerPosition: string | null;
    timeInCurrentPosition: string | null;
    timeInCurrentCompany: string | null;
    accountId: string | null;
    account?: {
      id: string;
      name: string;
      domain: string | null;
      industryStandardized: string | null;
      staffCount: number | null;
      annualRevenue: string | null;
      mainPhone: string | null;
      hqCity: string | null;
      hqState: string | null;
      hqPostalCode: string | null;
      hqCountry: string | null;
      hqStreet1: string | null;
      yearFounded: number | null;
      techStack: string[] | null;
      linkedinUrl: string | null;
    } | null;
  }>({
    queryKey: currentQueueItem?.contactId ? [`/api/contacts/${currentQueueItem.contactId}`] : [],
    enabled: !!currentQueueItem?.contactId,
  });

  const dialMode = campaignDetails?.dialMode || 'manual';
  const amdEnabled = campaignDetails?.hybridSettings?.amd?.enabled ?? false;

  // Fetch related contacts from the same company
  const { data: relatedContacts = [] } = useQuery<Array<{
    id: string;
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    directPhone: string | null;
    mobilePhone: string | null;
    jobTitle: string | null;
    seniorityLevel: string | null;
    queueState: 'queued' | 'in_progress' | 'locked' | 'released';
    queueId: string;
    priority: number;
    scheduledFor: string | null;
  }>>({
    queryKey: currentQueueItem?.contactId && selectedCampaignId 
      ? [`/api/campaigns/${selectedCampaignId}/queues/related-contacts/${currentQueueItem.contactId}`]
      : [],
    enabled: !!currentQueueItem?.contactId && !!selectedCampaignId,
  });

  // Clean, readable script renderer with stylish bullet points
  const renderFormattedScript = (script: string) => {
    if (!script) return null;

    // Helper to get bullet icon based on prefix
    const getBulletIcon = (bullet: string) => {
      // Check for special bullet markers: ✓, ★, →, ○
      if (bullet.includes('✓') || bullet.includes('✔')) {
        return <Check className="h-4 w-4 text-emerald-600" />;
      }
      if (bullet.includes('★') || bullet.includes('⭐')) {
        return <Star className="h-4 w-4 text-amber-500" />;
      }
      if (bullet.includes('→') || bullet.includes('➜')) {
        return <ArrowRight className="h-4 w-4 text-blue-600" />;
      }
      if (bullet.includes('○') || bullet.includes('◦')) {
        return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
      }

      // Numbered bullets
      if (bullet.match(/\d+\./)) {
        const num = bullet.replace('.', '');
        return (
          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-xs">{num}</span>
          </div>
        );
      }

      // Default bullet
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    };

    // Split into paragraphs (double line breaks)
    const paragraphs = script.split(/\n\n+/);

    return (
      <div className="space-y-6">
        {paragraphs.map((paragraph, pIndex) => {
          const lines = paragraph.split('\n').filter(l => l.trim());
          if (lines.length === 0) return null;

          // Check if this paragraph has bullets
          const hasBullets = lines.some(line => line.match(/^(\s*)([-*•✓✔★⭐→➜○◦]|\d+\.)\s+/));

          return (
            <div key={pIndex} className="space-y-2.5">
              {lines.map((line, lineIndex) => {
                const bulletMatch = line.match(/^(\s*)([-*•✓✔★⭐→➜○◦]|\d+\.)\s+(.*)$/);

                if (bulletMatch) {
                  const [, indent, bullet, content] = bulletMatch;
                  const indentLevel = indent.length / 2;

                  return (
                    <div 
                      key={lineIndex}
                      className="flex items-start gap-3 leading-relaxed"
                      style={{ marginLeft: `${indentLevel * 1.5}rem` }}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getBulletIcon(bullet)}
                      </div>
                      <div className="text-foreground text-[15px] flex-1 leading-relaxed font-normal">
                        {renderLineWithBoldPlaceholders(content)}
                      </div>
                    </div>
                  );
                }

                // Regular line - headings are bold and larger
                const isHeading = lineIndex === 0 && !hasBullets;
                return (
                  <div 
                    key={lineIndex} 
                    className={`leading-relaxed ${
                      isHeading 
                        ? 'text-lg font-bold text-foreground mb-2' 
                        : 'text-[15px] text-foreground/90 font-normal'
                    }`}
                  >
                    {renderLineWithBoldPlaceholders(line)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper function to render text with bold placeholders (replaces AND styles them)
  const renderLineWithBoldPlaceholders = (text: string) => {
    // Match both {{...}} and [...] patterns
    const parts = text.split(/(\{\{[^}]+\}\}|\[[^\]]+\])/g);

    return parts.map((part, i) => {
      // Check if this part is a placeholder and replace it with styled data
      const placeholder = part.match(/^\{\{([^}]+)\}\}$/) || part.match(/^\[([^\]]+)\]$/);

      if (placeholder) {
        // Get the replaced value
        const replacedValue = replacePlaceholders(part);

        return (
          <span key={i} className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            {replacedValue}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Function to replace placeholders in call script with actual contact/account/agent data
  const replacePlaceholders = (script: string): string => {
    if (!script) return '';

    // Get data from full contact details or fall back to queue item
    const contact = fullContactDetails || {
      fullName: currentQueueItem?.contactName || '',
      firstName: null,
      lastName: null,
      email: currentQueueItem?.contactEmail || '',
      directPhone: currentQueueItem?.contactPhone || '',
      mobilePhone: null,
      jobTitle: null,
      department: null,
      seniorityLevel: null,
      city: null,
      state: null,
      county: null,
      postalCode: null,
      country: null,
      linkedinUrl: null,
      formerPosition: null,
      timeInCurrentPosition: null,
      timeInCurrentCompany: null,
    };

    const account = fullContactDetails?.account || {
      name: currentQueueItem?.accountName || '',
      domain: null,
      industryStandardized: null,
      staffCount: null,
      annualRevenue: null,
      mainPhone: null,
      hqCity: null,
      hqState: null,
      hqPostalCode: null,
      hqCountry: null,
      hqStreet1: null,
      yearFounded: null,
      techStack: null,
      linkedinUrl: null,
    };

    const agent = {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.username || '',
      email: user?.email || '',
    };

    const campaign = {
      name: campaignDetails?.name || currentQueueItem?.campaignName || '',
    };

    // Replace contact placeholders - supports both {{}} and [] formats
    let result = script;
    result = result
      // Contact fields - {{ }} format
      .replace(/\{\{contact\.fullName\}\}/gi, contact.fullName)
      .replace(/\{\{contact\.firstName\}\}/gi, contact.firstName || contact.fullName.split(' ')[0] || '')
      .replace(/\{\{contact\.lastName\}\}/gi, contact.lastName || contact.fullName.split(' ').slice(1).join(' ') || '')
      .replace(/\{\{contact\.email\}\}/gi, contact.email)
      .replace(/\{\{contact\.phone\}\}/gi, contact.directPhone || '')
      .replace(/\{\{contact\.directPhone\}\}/gi, contact.directPhone || '')
      .replace(/\{\{contact\.mobilePhone\}\}/gi, contact.mobilePhone || '')
      .replace(/\{\{contact\.mobile\}\}/gi, contact.mobilePhone || '')
      .replace(/\{\{contact\.jobTitle\}\}/gi, contact.jobTitle || '')
      .replace(/\{\{contact\.title\}\}/gi, contact.jobTitle || '')
      .replace(/\{\{contact\.department\}\}/gi, contact.department || '')
      .replace(/\{\{contact\.seniority\}\}/gi, contact.seniorityLevel || '')
      .replace(/\{\{contact\.seniorityLevel\}\}/gi, contact.seniorityLevel || '')
      .replace(/\{\{contact\.city\}\}/gi, contact.city || '')
      .replace(/\{\{contact\.state\}\}/gi, contact.state || '')
      .replace(/\{\{contact\.county\}\}/gi, contact.county || '')
      .replace(/\{\{contact\.postalCode\}\}/gi, contact.postalCode || '')
      .replace(/\{\{contact\.zip\}\}/gi, contact.postalCode || '')
      .replace(/\{\{contact\.country\}\}/gi, contact.country || '')
      .replace(/\{\{contact\.linkedinUrl\}\}/gi, contact.linkedinUrl || '')
      .replace(/\{\{contact\.linkedin\}\}/gi, contact.linkedinUrl || '')
      .replace(/\{\{contact\.formerPosition\}\}/gi, contact.formerPosition || '')
      .replace(/\{\{contact\.timeInCurrentPosition\}\}/gi, contact.timeInCurrentPosition || '')
      .replace(/\{\{contact\.timeInCurrentCompany\}\}/gi, contact.timeInCurrentCompany || '')

      // Account fields - {{ }} format
      .replace(/\{\{account\.name\}\}/gi, account.name)
      .replace(/\{\{account\.company\}\}/gi, account.name)
      .replace(/\{\{account\.domain\}\}/gi, account.domain || '')
      .replace(/\{\{account\.industry\}\}/gi, account.industryStandardized || '')
      .replace(/\{\{account\.employees\}\}/gi, account.staffCount ? account.staffCount.toString() : '')
      .replace(/\{\{account\.staffCount\}\}/gi, account.staffCount ? account.staffCount.toString() : '')
      .replace(/\{\{account\.revenue\}\}/gi, account.annualRevenue || '')
      .replace(/\{\{account\.annualRevenue\}\}/gi, account.annualRevenue || '')
      .replace(/\{\{account\.phone\}\}/gi, account.mainPhone || '')
      .replace(/\{\{account\.mainPhone\}\}/gi, account.mainPhone || '')
      .replace(/\{\{account\.hqCity\}\}/gi, account.hqCity || '')
      .replace(/\{\{account\.city\}\}/gi, account.hqCity || '')
      .replace(/\{\{account\.hqState\}\}/gi, account.hqState || '')
      .replace(/\{\{account\.state\}\}/gi, account.hqState || '')
      .replace(/\{\{account\.hqPostalCode\}\}/gi, account.hqPostalCode || '')
      .replace(/\{\{account\.zip\}\}/gi, account.hqPostalCode || '')
      .replace(/\{\{account\.hqCountry\}\}/gi, account.hqCountry || '')
      .replace(/\{\{account\.country\}\}/gi, account.hqCountry || '')
      .replace(/\{\{account\.hqStreet1\}\}/gi, account.hqStreet1 || '')
      .replace(/\{\{account\.address\}\}/gi, account.hqStreet1 || '')
      .replace(/\{\{account\.yearFounded\}\}/gi, account.yearFounded ? account.yearFounded.toString() : '')
      .replace(/\{\{account\.founded\}\}/gi, account.yearFounded ? account.yearFounded.toString() : '')
      .replace(/\{\{account\.techStack\}\}/gi, account.techStack ? account.techStack.join(', ') : '')
      .replace(/\{\{account\.technologies\}\}/gi, account.techStack ? account.techStack.join(', ') : '')
      .replace(/\{\{account\.linkedinUrl\}\}/gi, account.linkedinUrl || '')
      .replace(/\{\{account\.linkedin\}\}/gi, account.linkedinUrl || '')

      // Agent fields - {{ }} format
      .replace(/\{\{agent\.fullName\}\}/gi, agent.fullName)
      .replace(/\{\{agent\.firstName\}\}/gi, agent.firstName)
      .replace(/\{\{agent\.lastName\}\}/gi, agent.lastName)
      .replace(/\{\{agent\.name\}\}/gi, agent.fullName)
      .replace(/\{\{agent\.email\}\}/gi, agent.email)

      // Campaign fields - {{ }} format
      .replace(/\{\{campaign\.name\}\}/gi, campaign.name)

      // Legacy [ ] format for backwards compatibility
      .replace(/\[Contact Name\]/gi, contact.fullName)
      .replace(/\[Contact First Name\]/gi, contact.firstName || contact.fullName.split(' ')[0] || '')
      .replace(/\[Contact Email\]/gi, contact.email)
      .replace(/\[Contact Phone\]/gi, contact.directPhone || '')
      .replace(/\[Contact Mobile\]/gi, contact.mobilePhone || '')
      .replace(/\[Contact City\]/gi, contact.city || '')
      .replace(/\[Contact State\]/gi, contact.state || '')
      .replace(/\[Contact Title\]/gi, contact.jobTitle || '')
      .replace(/\[Job Title\]/gi, contact.jobTitle || '')
      .replace(/\[Company Name\]/gi, account.name)
      .replace(/\[Company\]/gi, account.name)
      .replace(/\[Account Name\]/gi, account.name)
      .replace(/\[Industry\]/gi, account.industryStandardized || '')
      .replace(/\[Company City\]/gi, account.hqCity || '')
      .replace(/\[Company State\]/gi, account.hqState || '')
      .replace(/\[Agent Name\]/gi, agent.fullName)
      .replace(/\[Your Name\]/gi, agent.fullName)
      .replace(/\[Campaign Name\]/gi, campaign.name);

    return result;
  };

  // Get agent's assigned campaigns
  const { data: agentAssignments = [] } = useQuery<Array<{ campaignId: string; campaignName: string }>>({
    queryKey: ['/api/campaigns/agent-assignments'],
  });

  const campaigns: Campaign[] = agentAssignments.length > 0 
    ? agentAssignments.map(a => ({ id: a.campaignId, name: a.campaignName }))
    : Array.from(
        new Map(queueData.map(item => [item.campaignId, { id: item.campaignId, name: item.campaignName }])).values()
      );

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  // Auto-select first campaign
  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  // Reset index when queue changes
  useEffect(() => {
    setCurrentContactIndex(0);
  }, [queueData]);

  // Reset state when contact changes
  useEffect(() => {
    setDispositionSaved(false);
    setCallMadeToContact(false);
    setDisposition('');
    setNotes('');
    setQualificationData({});
  }, [currentQueueItem?.id]);

  // Mutation for creating call attempt when call connects
  const createCallAttemptMutation = useMutation({
    mutationFn: async (attemptData: any) => {
      const response = await apiRequest('POST', '/api/call-attempts/start', attemptData);
      return await response.json();
    },
    onSuccess: (data: { attemptId: string }) => {
      setActiveCallAttemptId(data.attemptId);
      console.log('[CALL-ATTEMPT] Created call attempt:', data.attemptId);
    },
    onError: (error: any) => {
      console.error('[CALL-ATTEMPT] Failed to create call attempt:', error);
    },
  });

  // Mutation for saving disposition
  const saveDispositionMutation = useMutation({
    mutationFn: async (dispositionData: any) => {
      return await apiRequest('POST', '/api/calls/disposition', dispositionData);
    },
    onSuccess: () => {
      toast({
        title: "Disposition saved",
        description: "Call disposition has been recorded successfully.",
      });

      setDispositionSaved(true);
      setDisposition('');
      setNotes('');
      setQualificationData({});
      setCallStatus('idle');
      setSwitchedContact(null);
      setActiveCallAttemptId(null);

      handleNextContact();
      refetchQueue();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save disposition",
        variant: "destructive",
      });
    },
  });

  // Create call attempt when call becomes active
  useEffect(() => {
    if (callStatus === 'active' && telnyxCallId && !activeCallAttemptId && currentQueueItem) {
      console.log('[CALL-ATTEMPT] Call became active, creating call attempt...');
      createCallAttemptMutation.mutate({
        campaignId: currentQueueItem.campaignId,
        contactId: switchedContact?.id || currentQueueItem.contactId,
        telnyxCallId: telnyxCallId,
        dialedNumber: dialedPhoneNumber,
      });
    }
  }, [callStatus, telnyxCallId, activeCallAttemptId, currentQueueItem, switchedContact]);

  const handleContactSwitched = (newContact: { id: string; fullName: string }) => {
    setSwitchedContact(newContact);
    toast({
      title: "Contact Updated",
      description: `Now speaking with ${newContact.fullName}`,
    });
  };

  const handleDial = () => {
    if (!isConnected) {
      toast({
        title: "Not connected",
        description: "WebRTC client is not connected. Please wait...",
        variant: "destructive",
      });
      return;
    }

    let phoneNumber: string | null = null;
    let phoneLabel = '';

    if (selectedPhoneType === 'manual') {
      phoneNumber = manualPhoneNumber.trim();
      phoneLabel = 'Manual Number';

      if (!phoneNumber) {
        toast({
          title: "No phone number",
          description: "Please enter a phone number to dial",
          variant: "destructive",
        });
        return;
      }
    } else if (selectedPhoneType === 'direct') {
      phoneNumber = contactDetails?.directPhone || null;
      phoneLabel = 'Direct Phone';
    } else if (selectedPhoneType === 'company') {
      phoneNumber = contactDetails?.account?.mainPhone || null;
      phoneLabel = 'Company Phone';
    }

    if (!phoneNumber) {
      toast({
        title: "No phone number",
        description: `This contact doesn't have a ${phoneLabel.toLowerCase()}`,
        variant: "destructive",
      });
      return;
    }

    // Convert country name to ISO code
    const countryNameToCode: Record<string, string> = {
      'United Kingdom': 'GB',
      'UK': 'GB',
      'United States': 'US',
      'USA': 'US',
      'US': 'US',
    };

    const rawCountry = fullContactDetails?.country || 'GB';
    const contactCountry = countryNameToCode[rawCountry] || rawCountry;

    // Debug logging
    console.log('🔍 Phone Validation Debug:', {
      phoneNumber,
      rawCountry,
      contactCountry,
      phoneType: selectedPhoneType,
      label: phoneLabel
    });

    // Handle phone numbers that already have country code but no +
    let normalizedPhone = phoneNumber;
    if (contactCountry === 'GB' && phoneNumber.match(/^44\d{10}$/)) {
      // UK number starting with 44 (missing +)
      normalizedPhone = `+${phoneNumber}`;
      console.log('📞 Added + to UK number:', normalizedPhone);
    } else if (!phoneNumber.startsWith('+')) {
      // Add + if missing
      normalizedPhone = phoneNumber.startsWith('0') 
        ? `+44${phoneNumber.substring(1)}` // UK landline with leading 0
        : `+${phoneNumber}`;
      console.log('📞 Normalized phone:', normalizedPhone);
    }

    let e164Phone = normalizePhoneToE164(normalizedPhone, contactCountry);

    console.log('✅ E164 Result:', e164Phone);

    if (!e164Phone) {
      toast({
        title: "Invalid phone number",
        description: `Cannot validate "${phoneNumber}". Please ensure it's in correct format (UK: +44xxxxxxxxxx or 0xxxxxxxxxx)`,
        variant: "destructive",
      });
      return;
    }

    if (selectedPhoneType === 'manual') {
      const manualDialNote = `[Manual Dial: ${phoneNumber}]`;
      setNotes(prev => prev ? `${prev}\n${manualDialNote}` : manualDialNote);
    }

    // Store the dialed phone number for later use in disposition
    setDialedPhoneNumber(e164Phone);
    
    makeCall(e164Phone, sipConfig?.callerIdNumber);
    setCallMadeToContact(true);
  };

  const handleHangup = () => {
    hangup();
  };

  const handleSaveDisposition = () => {
    if (!disposition) {
      toast({
        title: "Disposition required",
        description: "Please select a call disposition before proceeding.",
        variant: "destructive",
      });
      return;
    }

    if (!currentQueueItem) {
      toast({
        title: "Error",
        description: "No contact selected",
        variant: "destructive",
      });
      return;
    }

    hangup();

    saveDispositionMutation.mutate({
      queueItemId: currentQueueItem.id,
      campaignId: currentQueueItem.campaignId,
      contactId: switchedContact?.id || currentQueueItem.contactId, // Use switched contact if present
      disposition,
      duration: callDuration,
      notes,
      qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
      callbackRequested: disposition === 'callback-requested',
      telnyxCallId: telnyxCallId, // Include Telnyx call ID for recording lookup
      dialedNumber: dialedPhoneNumber, // Include dialed phone number for recording sync
      callAttemptId: activeCallAttemptId, // Include call attempt ID for linking
      // Track contact switch if it happened
      originalContactId: switchedContact ? currentQueueItem.contactId : null,
      actualContactId: switchedContact?.id || null,
      wrongPersonAnswered: !!switchedContact,
    });
  };

  const handleNextContact = () => {
    if (currentContactIndex < queueData.length - 1) {
      setCurrentContactIndex(currentContactIndex + 1);
    }
  };

  const handlePreviousContact = () => {
    if (currentContactIndex > 0) {
      setCurrentContactIndex(currentContactIndex - 1);
    }
  };

  const isCallActive = ['connecting', 'ringing', 'active', 'held'].includes(callStatus);

  const getStatusBadge = () => {
    if (!isConnected) {
      return <Badge variant="destructive" data-testid="badge-not-connected">Disconnected</Badge>;
    }

    switch (callStatus) {
      case 'idle':
        return <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 shadow-lg" data-testid="badge-call-idle">Ready</Badge>;
      case 'connecting':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-connecting">Connecting...</Badge>;
      case 'ringing':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-ringing">Ringing...</Badge>;
      case 'active':
        return <Badge className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-0 shadow-lg" data-testid="badge-call-active">Active - {formatDuration()}</Badge>;
      case 'held':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-held">On Hold</Badge>;
      case 'wrap-up':
        return <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 shadow-lg" data-testid="badge-call-wrapup">Wrap-Up</Badge>;
      default:
        return null;
    }
  };

  const queueProgress = queueData.length > 0 ? ((currentContactIndex + 1) / queueData.length) * 100 : 0;

  if (!queueData || queueData.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Agent Console</h1>
          {selectedCampaign && (
            <p className="text-sm text-muted-foreground">
              Campaign: {selectedCampaign.name}
            </p>
          )}
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Queue is empty</h3>
              <p className="text-muted-foreground mb-4">
                {selectedCampaign 
                  ? "No contacts available in this campaign's queue"
                  : "Please select a campaign to start calling"}
              </p>
              {!selectedCampaign && campaigns && campaigns.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-2">Select a campaign:</p>
                  <Select value={selectedCampaignId || ""} onValueChange={setSelectedCampaignId}>
                    <SelectTrigger className="w-64 mx-auto">
                      <SelectValue placeholder="Choose campaign..." />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {selectedCampaign && selectedCampaignId && dialMode === 'manual' && (
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-3">Use the button below to set up your queue:</p>
                  <QueueControls 
                    campaignId={selectedCampaignId}
                    compact={false}
                    renderDialogs={true}
                    onQueueUpdated={() => {
                      refetchQueue();
                      toast({
                        title: "Queue Updated",
                        description: "Your queue has been refreshed",
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* TOP FIXED HEADER - Premium Gradient Design - IMPROVED RESPONSIVE */}
      <div className="border-b shadow-2xl relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0ea5a4 50%, #38bdf8 100%)' }}>
        {/* Decorative overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0"></div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>

        {/* Compact Mobile Header */}
        <div className="lg:hidden">
          {/* Row 1: Title & Campaign Selector */}
          <div className="px-3 py-2 flex items-center gap-2 border-b border-white/10">
            <div className="flex-1 min-w-0">
              <h1 className="text-white font-semibold text-sm truncate" data-testid="text-page-title">Agent Console</h1>
              <p className="text-white/70 text-[10px] truncate">
                {campaignDetails?.name || 'Select a campaign'}
              </p>
            </div>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-[140px] min-h-10 bg-white/10 text-white border-white/20 text-xs" data-testid="select-campaign">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(campaign => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: Status Badges & Controls */}
          <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
            {campaignDetails && dialMode && (
              <Badge variant={dialMode === 'hybrid' ? 'default' : 'secondary'} className="gap-1 text-[10px] h-6" data-testid="badge-dial-mode">
                {dialMode === 'hybrid' ? <Zap className="h-2.5 w-2.5" /> : <Phone className="h-2.5 w-2.5" />}
                {dialMode === 'hybrid' ? 'Hybrid' : dialMode === 'ai_agent' ? 'AI Agent' : 'Manual'}
              </Badge>
            )}

            {callStatus === 'active' && (
              <div className="flex items-center gap-1 text-white">
                <Clock className="h-3 w-3" />
                <span className="font-mono text-[10px]" data-testid="text-call-duration">{formatDuration()}</span>
              </div>
            )}

            <div className="flex-1"></div>

            {getStatusBadge()}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAudioSettings(true)}
              className="h-10 w-10 p-0 text-white hover:bg-white/10"
              data-testid="button-audio-settings"
              title="Audio Settings"
            >
              <Volume2 className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchQueue()}
              className="h-10 w-10 p-0 text-white hover:bg-white/10"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Row 3: Queue Progress */}
          <div className="px-3 pb-2">
            <div className="text-center mb-1">
              <span className="text-white text-[10px] font-medium">
                Contact {currentContactIndex + 1} of {queueData.length}
              </span>
            </div>
            <Progress value={queueProgress} className="h-1 bg-white/20" />
          </div>
        </div>

        {/* Desktop Header - Original Layout */}
        <div className="hidden lg:flex relative h-20 px-6 items-center gap-4 justify-between">
          {/* Left: Title & Queue Management */}
          <div className="flex items-center gap-4 flex-nowrap flex-shrink-0">
            <div>
              <h1 className="text-white font-semibold text-lg" data-testid="text-page-title">Agent Console</h1>
              <p className="text-white/70 text-xs line-clamp-1">
                {campaignDetails?.name || 'Select a campaign'}
              </p>
            </div>

            {campaignDetails && dialMode === 'manual' && selectedCampaignId && (
              <>
                <Separator orientation="vertical" className="h-8 bg-white/20" />
                <QueueControls 
                  campaignId={selectedCampaignId}
                  compact={true}
                  renderDialogs={true}
                  onQueueUpdated={() => {
                    refetchQueue();
                    toast({
                      title: "Queue Updated",
                      description: "Your queue has been refreshed",
                    });
                  }}
                />
              </>
            )}
          </div>

          {/* Center: Queue Progress */}
          <div className="flex-1 max-w-lg mx-4">
            <div className="text-center mb-1">
              <span className="text-white text-sm font-medium">
                Contact {currentContactIndex + 1} of {queueData.length}
              </span>
            </div>
            <Progress value={queueProgress} className="h-2 bg-white/20" />
          </div>

          {/* Right: Status & Controls */}
          <div className="flex items-center gap-3 flex-nowrap flex-shrink-0">
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-[200px] bg-white/10 text-white border-white/20 text-sm" data-testid="select-campaign">
                <SelectValue placeholder="Select campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(campaign => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {campaignDetails && dialMode && (
              <Badge variant={dialMode === 'hybrid' ? 'default' : 'secondary'} className="gap-1" data-testid="badge-dial-mode">
                {dialMode === 'hybrid' ? <Zap className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                {dialMode === 'hybrid' ? 'Hybrid' : dialMode === 'ai_agent' ? 'AI Agent' : 'Manual'}
              </Badge>
            )}

            {campaignDetails && dialMode === 'hybrid' && amdEnabled && (
              <Badge variant="outline" className="gap-1 bg-white/10 text-white border-white/20 text-xs" data-testid="badge-amd-enabled">
                <CheckCircle2 className="h-3 w-3" />
                AMD
              </Badge>
            )}

            {callStatus === 'active' && (
              <div className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4" />
                <span className="font-mono text-sm" data-testid="text-call-duration">{formatDuration()}</span>
              </div>
            )}

            {getStatusBadge()}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAudioSettings(true)}
              className="text-white hover:bg-white/10"
              data-testid="button-audio-settings-desktop"
              title="Audio Settings"
            >
              <Volume2 className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchQueue()}
              className="text-white hover:bg-white/10"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* MAIN BODY GRID */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT SIDEBAR: Queue - Modern Glass Design */}
        <div className="w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r flex flex-col bg-gradient-to-b from-primary/5 to-card max-h-96 lg:max-h-none">
          <div className="p-4 border-b relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
            <div className="relative">
              <h2 className="font-bold text-sm mb-3 text-white flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Phone className="h-3.5 w-3.5 text-white" />
                </div>
                Queue
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousContact}
                  disabled={currentContactIndex === 0 || queueData.length === 0 || isCallActive || (callMadeToContact && !dispositionSaved)}
                  className="flex-1 bg-white/90 hover:bg-white border-0 text-foreground font-medium shadow-lg hover:shadow-xl transition-all"
                  data-testid="button-previous-contact"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextContact}
                  disabled={
                    currentContactIndex >= queueData.length - 1 || 
                    queueData.length === 0 ||
                    isCallActive ||
                    (callMadeToContact && !dispositionSaved)
                  }
                  className="flex-1 bg-white/90 hover:bg-white border-0 text-foreground font-medium shadow-lg hover:shadow-xl transition-all"
                  data-testid="button-next-contact"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Queue List - No scrolling, fits viewport */}
          <div className="flex-1 p-2 space-y-1 min-h-0">
            {queueLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <>
                <div className="text-[10px] text-muted-foreground px-2 mb-2">
                  Showing {Math.min(queueData.length, 15)} of {queueData.length} contacts
                </div>
                {queueData.slice(0, 15).map((item, index) => {
                  const isDisabled = (isCallActive || (callMadeToContact && !dispositionSaved)) && index !== currentContactIndex;
                  const isActive = index === currentContactIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !isDisabled && setCurrentContactIndex(index)}
                      disabled={isDisabled}
                      className={`
                        w-full text-left p-3 rounded-xl transition-all relative overflow-hidden
                        ${isActive 
                          ? 'bg-primary/10 border-2 border-primary/30 shadow-lg transform scale-105' 
                          : 'bg-white border-2 border-border/60 hover:border-primary/30'}
                        ${isDisabled 
                          ? 'opacity-50 cursor-not-allowed' 
                          : 'hover:shadow-md cursor-pointer'}
                      `}
                      title={isDisabled ? 'Complete disposition before switching contacts' : ''}
                    >
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-teal-accent/10"></div>
                      )}
                      <div className="relative flex items-start gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 shadow-lg ${
                          isActive ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold truncate ${isActive ? 'text-foreground' : 'text-gray-900'}`}>
                            {item.contactName}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">{item.accountName}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* RIGHT MAIN SECTION (82% width) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* CONTACT INFORMATION BAR - Premium Card Design - IMPROVED RESPONSIVE */}
          {currentQueueItem ? (
            <div className="border-b relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)' }}>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0"></div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-teal-accent to-sky-400"></div>

              {/* Mobile Layout */}
              <div className="lg:hidden relative px-3 py-3 text-white space-y-3">
                {/* Row 1: Profile & Name */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl border border-white/20">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-green-500 rounded-full border-2 border-white shadow-lg"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold truncate" data-testid="text-contact-name">
                      {currentQueueItem.contactName || 'Unknown Contact'}
                    </h2>
                    <div className="flex items-center gap-1.5 text-xs text-white/90">
                      <Briefcase className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate" data-testid="text-contact-title">
                        {contactDetails?.jobTitle || 'No title'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Company & Email */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-white/90">
                    <Building2 className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate" data-testid="text-contact-company">
                      {currentQueueItem.accountName || 'No company'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-white/90">
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate" data-testid="text-contact-email">
                      {currentQueueItem.contactEmail || contactDetails?.email || 'No email'}
                    </span>
                  </div>
                </div>

                {/* Row 3: Phone Selector */}
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0 text-white/90" />
                  <Select value={selectedPhoneType} onValueChange={(value: 'direct' | 'company' | 'manual') => {
                    setSelectedPhoneType(value);
                    setShowManualDial(value === 'manual');
                  }}>
                    <SelectTrigger className="min-h-10 flex-1 bg-white/10 text-white border-white/20 text-xs" data-testid="select-phone-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {validPhoneOptions.map((option) => (
                        <SelectItem key={option.type} value={option.type} data-testid={`option-${option.type}-phone`}>
                          {option.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="manual" data-testid="option-manual-dial">
                        Manual Dial
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Manual Phone Input */}
                {showManualDial && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0 text-white/90" />
                    <input
                      type="tel"
                      className="min-h-10 px-3 rounded bg-white/10 border border-white/20 text-white text-xs placeholder:text-white/50 flex-1"
                      placeholder="Enter phone number"
                      value={manualPhoneNumber}
                      onChange={(e) => setManualPhoneNumber(e.target.value)}
                      data-testid="input-manual-phone"
                    />
                  </div>
                )}

                {/* Row 4: Call Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleMute}
                    disabled={!isCallActive}
                    className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs"
                    data-testid="button-mute"
                  >
                    {isMuted ? (
                      <><MicOff className="h-3 w-3 mr-1" />Unmute</>
                    ) : (
                      <><Mic className="h-3 w-3 mr-1" />Mute</>
                    )}
                  </Button>

                  {callStatus === 'active' && activeCallAttemptId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowContactMismatch(true)}
                      className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs"
                      data-testid="button-wrong-person"
                    >
                      <User className="h-3 w-3 mr-1" />
                      Wrong Person
                    </Button>
                  )}

                  <div className="flex-1">
                    {!isCallActive && callStatus !== 'wrap-up' && (
                      <Button
                        size="lg"
                        className="w-full h-12 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold shadow-2xl border-2 border-white/30 text-sm"
                        onClick={handleDial}
                        disabled={!currentQueueItem}
                        data-testid="button-dial"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Call Now
                      </Button>
                    )}

                    {isCallActive && (
                      <Button
                        size="lg"
                        className="w-full h-12 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold shadow-2xl border-2 border-white/30 text-sm"
                        onClick={handleHangup}
                        data-testid="button-hangup"
                      >
                        <PhoneOff className="h-4 w-4 mr-2" />
                        Hang Up
                      </Button>
                    )}

                    {callStatus === 'wrap-up' && (
                      <div className="w-full h-12 flex items-center justify-center text-xs text-white font-medium text-center bg-white/20 backdrop-blur-sm rounded-xl border-2 border-white/30 shadow-xl px-2">
                        Complete disposition below
                      </div>
                    )}
                  </div>
                </div>

                {/* DTMF Keypad Toggle & Keypad - Shows during active call */}
                {callStatus === 'active' && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowKeypad(!showKeypad)}
                      className="w-full bg-white/10 hover:bg-white/20 border-white/30 text-white text-xs"
                      data-testid="button-toggle-keypad"
                    >
                      <Hash className="h-3 w-3 mr-2" />
                      {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                    </Button>

                    {showKeypad && (
                      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                        <div className="text-[10px] text-white/70 text-center mb-2">Dial Extensions</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                            <Button
                              key={digit}
                              variant="outline"
                              size="icon"
                              onClick={() => sendDTMF?.(digit)}
                              className="bg-white/20 hover:bg-white/30 border-white/30 text-white text-base font-bold"
                              data-testid={`button-dtmf-${digit}`}
                            >
                              {digit}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Desktop Layout - Original */}
              <div className="hidden lg:flex relative px-6 py-6 items-start gap-6 text-white">
                {/* Profile Picture - Enhanced */}
                <div className="relative flex-shrink-0">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl border border-white/20">
                    <User className="h-8 w-8 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-green-500 rounded-full border-2 border-white shadow-lg"></div>
                </div>

                {/* Contact Information - Organized Layout */}
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  {/* Contact Name */}
                  <h2 className="text-xl font-semibold truncate" data-testid="text-contact-name">
                    {currentQueueItem.contactName || 'Unknown Contact'}
                  </h2>

                  {/* Contact Details Grid */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                    {/* Job Title & Company */}
                    <div className="flex items-center gap-2 text-sm text-white/90">
                      <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate" data-testid="text-contact-title">
                        {contactDetails?.jobTitle || 'No title'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-white/90">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate" data-testid="text-contact-company">
                        {currentQueueItem.accountName || 'No company'}
                      </span>
                    </div>

                    {/* Email & Phone */}
                    <div className="flex items-center gap-2 text-sm text-white/90">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate" data-testid="text-contact-email">
                        {currentQueueItem.contactEmail || contactDetails?.email || 'No email'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0 text-white/90" />
                      <Select value={selectedPhoneType} onValueChange={(value: 'direct' | 'company' | 'manual') => {
                        setSelectedPhoneType(value);
                        setShowManualDial(value === 'manual');
                      }}>
                        <SelectTrigger className="h-8 bg-white/10 text-white border-white/20 text-sm w-[200px]" data-testid="select-phone-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {validPhoneOptions.map((option) => (
                            <SelectItem key={option.type} value={option.type} data-testid={`option-${option.type}-phone`}>
                              {option.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="manual" data-testid="option-manual-dial">
                            Manual Dial
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Manual Phone Input */}
                    {showManualDial && (
                      <div className="col-span-2 flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0 text-white/90" />
                        <input
                          type="tel"
                          className="h-8 px-3 rounded bg-white/10 border border-white/20 text-white text-sm placeholder:text-white/50 w-[200px]"
                          placeholder="Enter phone number"
                          value={manualPhoneNumber}
                          onChange={(e) => setManualPhoneNumber(e.target.value)}
                          data-testid="input-manual-phone"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio Controls - Integrated */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleMute}
                    disabled={!isCallActive}
                    className="bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-sm"
                    data-testid="button-mute"
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="h-4 w-4 mr-2" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 mr-2" />
                        Mute
                      </>
                    )}
                  </Button>
                </div>

                {/* Call Button - Premium Design */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    {!isCallActive && callStatus !== 'wrap-up' && (
                      <Button
                        size="lg"
                        className="h-16 w-36 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold shadow-2xl transform hover:scale-105 transition-all border-2 border-white/30 text-base"
                        onClick={handleDial}
                        disabled={!currentQueueItem}
                        data-testid="button-dial"
                      >
                        <Phone className="h-5 w-5 mr-2" />
                        Call
                      </Button>
                    )}

                    {isCallActive && (
                      <Button
                        size="lg"
                        className="h-16 w-36 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold shadow-2xl transform hover:scale-105 transition-all border-2 border-white/30 text-base"
                        onClick={handleHangup}
                        data-testid="button-hangup"
                      >
                        <PhoneOff className="h-5 w-5 mr-2" />
                        Hang Up
                      </Button>
                    )}

                    {callStatus === 'wrap-up' && (
                      <div className="h-16 w-36 flex items-center justify-center text-sm text-white font-medium text-center bg-white/20 backdrop-blur-sm rounded-2xl border-2 border-white/30 shadow-xl px-2">
                        Complete disposition below
                      </div>
                    )}
                  </div>

                  {/* DTMF Keypad Toggle & Keypad - Shows during active call */}
                  {callStatus === 'active' && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowKeypad(!showKeypad)}
                        className="bg-white/10 hover:bg-white/20 border-white/30 text-white text-xs"
                        data-testid="button-toggle-keypad-desktop"
                      >
                        <Hash className="h-3 w-3 mr-2" />
                        {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                      </Button>

                      {showKeypad && (
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20 shadow-xl">
                          <div className="text-xs text-white/80 text-center mb-2 font-medium">Dial Extensions</div>
                          <div className="grid grid-cols-3 gap-2">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                              <Button
                                key={digit}
                                variant="outline"
                                size="icon"
                                onClick={() => sendDTMF?.(digit)}
                                className="bg-white/20 hover:bg-white/30 border-white/30 text-white text-base font-bold"
                                data-testid={`button-dtmf-${digit}`}
                              >
                                {digit}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b bg-muted/30 py-6 flex items-center justify-center">
              <div className="text-center">
                <Phone className="h-10 w-10 mx-auto mb-2 opacity-50 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No contact selected</p>
              </div>
            </div>
          )}

          {/* BOTTOM SPLIT: Script | Dispositions - Premium Design */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
            {/* LEFT: SCRIPT PANEL - Clean & Readable */}
            <div className="w-full lg:flex-[2] border-b lg:border-b-0 lg:border-r bg-white dark:bg-background min-h-[300px] lg:min-h-0 flex flex-col">
              <div className="flex-shrink-0 px-6 py-4 border-b bg-muted/30">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base text-foreground">Call Script</h3>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                <div className="p-6">
                  {(assignedScript?.content || campaignDetails?.callScript) ? (
                    renderFormattedScript(assignedScript?.content || campaignDetails?.callScript || '')
                  ) : (
                    <div className="space-y-5 text-foreground/80">
                      <p className="text-base leading-relaxed font-normal">
                        "Hello, this is [Your Name] calling from PipelineIQ. May I speak with{' '}
                        <span className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {currentQueueItem?.contactName || '[Contact Name]'}
                        </span>?"
                      </p>
                      <p className="text-base leading-relaxed font-normal">
                        "I'm calling to discuss how our B2B solutions can help{' '}
                        <span className="font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {currentQueueItem?.accountName || '[Company Name]'}
                        </span>{' '}
                        streamline their customer engagement..."
                      </p>
                      <p className="text-base leading-relaxed text-foreground/70 italic font-normal">
                        "We specialize in Account-Based Marketing. Do you have a few minutes to discuss your marketing challenges?"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: DISPOSITIONS PANEL - Premium Cards */}
            <div className="w-full lg:flex-1 p-2 md:p-3 bg-gradient-to-br from-slate-50 to-gray-50 min-h-0 overflow-auto">
              <div className="p-4 space-y-4">
                {/* Related Contacts from Same Company */}
                {relatedContacts.length > 0 && (
                  <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
                  <CardHeader className="pb-2 bg-gradient-to-r from-primary/10 to-teal-accent/10 border-b border-border/60">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-teal-accent flex items-center justify-center">
                          <Building2 className="h-3 w-3 text-white" />
                        </div>
                        Other Contacts at {currentQueueItem?.accountName}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {relatedContacts.length} other {relatedContacts.length === 1 ? 'contact' : 'contacts'} in your queue
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {relatedContacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="p-2.5 rounded-lg border bg-gradient-to-r from-muted/40 to-muted/20 hover-elevate transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {contact.fullName}
                                  </p>
                                  <Badge 
                                    variant={contact.queueState === 'in_progress' ? 'default' : 'secondary'}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {contact.queueState === 'in_progress' ? 'Active' : 'Queued'}
                                  </Badge>
                                </div>
                                {contact.jobTitle && (
                                  <p className="text-xs text-gray-600 truncate mt-0.5">
                                    {contact.jobTitle}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1">
                                  {contact.email && (
                                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                      <Mail className="h-2.5 w-2.5" />
                                      <span className="truncate max-w-[120px]">{contact.email}</span>
                                    </div>
                                  )}
                                  {(contact.directPhone || contact.mobilePhone) && (
                                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                      <Phone className="h-2.5 w-2.5" />
                                      <span>{contact.directPhone || contact.mobilePhone}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Call Notes - Enhanced */}
                <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm">
                  <CardHeader className="pb-2 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-b border-blue-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                        <FileText className="h-3 w-3 text-white" />
                      </div>
                      Call Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <Textarea
                      className="min-h-[80px] resize-none text-sm border-2 border-blue-100 focus:border-blue-300 rounded-lg"
                      placeholder="Brief notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      data-testid="input-call-notes"
                    />
                  </CardContent>
                </Card>

                {/* Disposition - Premium Design */}
                <Card className={`border-0 shadow-xl bg-white/90 backdrop-blur-sm ${callStatus === 'wrap-up' ? 'ring-4 ring-warning/50 ring-offset-2' : ''}`}>
                  <CardHeader className="pb-2 bg-gradient-to-r from-primary/10 to-teal-accent/10 border-b border-border/60">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary to-teal-accent flex items-center justify-center">
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      </div>
                      Disposition {callStatus === 'wrap-up' && <span className="text-red-500">*</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="disposition" className="text-xs">Outcome {callStatus === 'wrap-up' && '*'}</Label>
                      <Select value={disposition} onValueChange={setDisposition}>
                        <SelectTrigger id="disposition" className="h-9" data-testid="select-disposition">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="qualified">✅ Qualified</SelectItem>
                          <SelectItem value="callback-requested">📞 Call Back</SelectItem>
                          <SelectItem value="not_interested">❌ Not Interested</SelectItem>
                          <SelectItem value="voicemail">📧 Voicemail</SelectItem>
                          <SelectItem value="dnc-request">🚫 Do Not Call</SelectItem>
                          <SelectItem value="invalid_data">⚠️ Invalid Data</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Qualification Questions */}
                    {campaignDetails?.qualificationQuestions && campaignDetails.qualificationQuestions.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Qualification</Label>
                        <div className="space-y-2">
                          {campaignDetails.qualificationQuestions.map((question) => (
                            <div key={question.id} className="space-y-1">
                              <Label htmlFor={question.id} className="text-xs">
                                {question.label}
                                {question.required && <span className="text-destructive ml-1">*</span>}
                              </Label>
                              {question.type === 'select' && question.options ? (
                                <Select
                                  value={qualificationData[question.id] || ''}
                                  onValueChange={(value) => setQualificationData({...qualificationData, [question.id]: value})}
                                >
                                  <SelectTrigger id={question.id} className="h-8 text-xs" data-testid={`select-qual-${question.id}`}>
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {question.options.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : question.type === 'text' ? (
                                <Textarea
                                  id={question.id}
                                  value={qualificationData[question.id] || ''}
                                  onChange={(e) => setQualificationData({...qualificationData, [question.id]: e.target.value})}
                                  placeholder={`Enter ${question.label.toLowerCase()}...`}
                                  className="min-h-[50px] resize-none text-xs"
                                  data-testid={`input-qual-${question.id}`}
                                />
                              ) : (
                                <input
                                  type="number"
                                  id={question.id}
                                  value={qualificationData[question.id] || ''}
                                  onChange={(e) => setQualificationData({...qualificationData, [question.id]: e.target.value})}
                                  placeholder={`Enter ${question.label.toLowerCase()}...`}
                                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  data-testid={`input-qual-${question.id}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Save Button - Premium Design */}
                    {(callStatus === 'wrap-up' || disposition) && (
                      <Button
                        onClick={handleSaveDisposition}
                        disabled={!disposition || saveDispositionMutation.isPending || !currentQueueItem}
                        size="lg"
                        className="w-full bg-gradient-to-r from-primary to-teal-accent hover:from-primary/90 hover:to-teal-accent/90 text-white font-bold shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all rounded-xl border-2 border-white/20"
                        data-testid="button-save-disposition"
                      >
                        {saveDispositionMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            Save & Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    )}

                    {callDuration > 0 && (
                      <div className="text-sm text-muted-foreground">
                        Call duration: {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden audio element for Telnyx */}
      <audio id="remoteAudio" autoPlay playsInline style={{ display: 'none' }} />

      {/* Audio Device Settings Dialog */}
      <AudioDeviceSettings
        open={showAudioSettings}
        onOpenChange={setShowAudioSettings}
        onDevicesSelected={(micId, speakerId) => {
          if (setAudioDevices) {
            setAudioDevices(micId, speakerId);
          }
        }}
      />

      {/* Contact Mismatch Dialog (Wrong Person Answered) */}
      {activeCallAttemptId && currentQueueItem && (
        <ContactMismatchDialog
          open={showContactMismatch}
          onOpenChange={setShowContactMismatch}
          callAttemptId={activeCallAttemptId}
          currentContact={{
            id: currentQueueItem.contactId,
            fullName: switchedContact?.fullName || currentQueueItem.contactName,
            accountId: currentQueueItem.accountId,
            accountName: currentQueueItem.accountName || '',
          }}
          onContactSwitched={handleContactSwitched}
        />
      )}

      {/* Lead Verification Modal */}
      {showVerificationModal && verificationLeadId && currentQueueItem && user?.id && (
        <LeadVerificationModal
          isOpen={showVerificationModal}
          onClose={() => {
            // Just close the modal - do NOT save disposition if user cancels
            setShowVerificationModal(false);
          }}
          onVerificationComplete={() => {
            // Only save disposition AFTER successful verification
            saveDispositionMutation.mutate({
              queueItemId: currentQueueItem.id,
              campaignId: currentQueueItem.campaignId,
              contactId: switchedContact?.id || currentQueueItem.contactId,
              disposition,
              duration: callDuration,
              notes,
              qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
              callbackRequested: false,
              telnyxCallId: telnyxCallId,
              dialedNumber: dialedPhoneNumber,
              callAttemptId: activeCallAttemptId,
              originalContactId: switchedContact ? currentQueueItem.contactId : null,
              actualContactId: switchedContact?.id || null,
              wrongPersonAnswered: !!switchedContact,
            });
          }}
          leadId={verificationLeadId}
          contactName={switchedContact?.fullName || currentQueueItem.contactName}
          companyName={currentQueueItem.accountName || ''}
          jobTitle={contactDetails?.jobTitle}
          agentId={user.id}
          campaignId={currentQueueItem.campaignId}
          contactId={switchedContact?.id || currentQueueItem.contactId}
        />
      )}
    </div>
  );
}
