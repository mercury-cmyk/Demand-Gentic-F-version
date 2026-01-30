import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Phone,
  PhoneOff,
  PhoneForwarded,
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
  Circle,
  ArrowRight,
  Star,
  Check,
  Pause,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CONTACT_FIELD_LABELS, ACCOUNT_FIELD_LABELS } from '@shared/field-labels';
import { QueueControls } from "@/components/queue-controls";
import { ContactMismatchDialog } from "@/components/contact-mismatch-dialog";
import { LeadVerificationModal } from "@/components/lead-verification-modal";
import { AudioDeviceSettings } from "@/components/audio-device-settings";
import { useCallControl } from "@/hooks/useCallControl";
import { useSIPWebRTC } from "@/hooks/useTelnyxWebRTC";

// Call state type for Call Control API calls
type CallState = 'idle' | 'calling_agent' | 'agent_connected' | 'calling_prospect' | 'connecting' | 'ringing' | 'active' | 'held' | 'hangup';

// Backwards compatibility type alias
type CallStatus = CallState | 'wrap-up';

// Country name to ISO 3166-1 alpha-2 code mapping
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // Common variations
  'United Kingdom': 'GB',
  'United Kingdom Uk': 'GB',  // Handle "United Kingdom Uk" variant from data imports
  'UK': 'GB',
  'Great Britain': 'GB',
  'England': 'GB',
  'Scotland': 'GB',
  'Wales': 'GB',
  'Northern Ireland': 'GB',
  'United States': 'US',
  'USA': 'US',
  'US': 'US',
  'United States of America': 'US',
  'America': 'US',
  'Canada': 'CA',
  'Australia': 'AU',
  'New Zealand': 'NZ',
  'Ireland': 'IE',
  'Germany': 'DE',
  'France': 'FR',
  'Spain': 'ES',
  'Italy': 'IT',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Poland': 'PL',
  'Portugal': 'PT',
  'Greece': 'GR',
  'Czech Republic': 'CZ',
  'Czechia': 'CZ',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Croatia': 'HR',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Luxembourg': 'LU',
  'Malta': 'MT',
  'Cyprus': 'CY',
  'Iceland': 'IS',
  'India': 'IN',
  'China': 'CN',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Korea': 'KR',
  'Singapore': 'SG',
  'Hong Kong': 'HK',
  'Taiwan': 'TW',
  'Malaysia': 'MY',
  'Thailand': 'TH',
  'Philippines': 'PH',
  'Indonesia': 'ID',
  'Vietnam': 'VN',
  'Pakistan': 'PK',
  'Bangladesh': 'BD',
  'Sri Lanka': 'LK',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'Saudi Arabia': 'SA',
  'Qatar': 'QA',
  'Kuwait': 'KW',
  'Bahrain': 'BH',
  'Oman': 'OM',
  'Israel': 'IL',
  'Turkey': 'TR',
  'South Africa': 'ZA',
  'Egypt': 'EG',
  'Nigeria': 'NG',
  'Kenya': 'KE',
  'Morocco': 'MA',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'Venezuela': 'VE',
  'Russia': 'RU',
  'Ukraine': 'UA',
};

// Country code to dialing code mapping for phone normalization
const COUNTRY_DIALING_CODES: Record<string, string> = {
  'US': '1', 'CA': '1',
  'GB': '44', 'IE': '353',
  'AU': '61', 'NZ': '64',
  'DE': '49', 'FR': '33', 'ES': '34', 'IT': '39', 'NL': '31',
  'BE': '32', 'CH': '41', 'AT': '43', 'SE': '46', 'NO': '47',
  'DK': '45', 'FI': '358', 'PL': '48', 'PT': '351', 'GR': '30',
  'CZ': '420', 'HU': '36', 'RO': '40', 'BG': '359', 'HR': '385',
  'SK': '421', 'SI': '386', 'EE': '372', 'LV': '371', 'LT': '370',
  'LU': '352', 'MT': '356', 'CY': '357', 'IS': '354',
  'IN': '91', 'CN': '86', 'JP': '81', 'KR': '82', 'SG': '65',
  'HK': '852', 'TW': '886', 'MY': '60', 'TH': '66', 'PH': '63',
  'ID': '62', 'VN': '84', 'PK': '92', 'BD': '880', 'LK': '94',
  'AE': '971', 'SA': '966', 'QA': '974', 'KW': '965', 'BH': '973',
  'OM': '968', 'IL': '972', 'TR': '90',
  'ZA': '27', 'EG': '20', 'NG': '234', 'KE': '254', 'MA': '212',
  'BR': '55', 'MX': '52', 'AR': '54', 'CL': '56', 'CO': '57',
  'PE': '51', 'VE': '58', 'RU': '7', 'UA': '380',
};

// Helper function to get ISO country code from country name or code
function getCountryCode(country: string | null | undefined): string {
  if (!country) return 'US'; // Default to US
  const trimmed = country.trim();
  // If it's already a 2-letter code, return uppercase
  if (trimmed.length === 2) return trimmed.toUpperCase();

  // Direct lookup first
  if (COUNTRY_NAME_TO_CODE[trimmed]) {
    return COUNTRY_NAME_TO_CODE[trimmed];
  }

  // Case-insensitive lookup for better matching
  const lowerTrimmed = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (key.toLowerCase() === lowerTrimmed) {
      return value;
    }
  }

  // Partial match for common patterns (e.g., "United Kingdom Uk" contains "United Kingdom")
  for (const [key, value] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (lowerTrimmed.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerTrimmed)) {
      return value;
    }
  }

  console.warn(`⚠️ Unknown country: "${country}" - defaulting to US`);
  return 'US';
}

// Helper function to validate and normalize phone number to E.164
function normalizePhoneToE164(phone: string | null, country: string = 'US'): string | null {
  if (!phone) return null;

  let cleanedPhone = phone.trim();
  const countryCode = getCountryCode(country);
  const dialingCode = COUNTRY_DIALING_CODES[countryCode] || '1';

  console.log('📱 Normalizing phone:', { phone: cleanedPhone, country, countryCode, dialingCode });

  // Remove common formatting characters but keep + and digits
  cleanedPhone = cleanedPhone.replace(/[\s\-\(\)\.]/g, '');

  // CRITICAL FIX: UK numbers with leading 0 after country code (+440...)
  // These calls will NOT connect - the 0 must be removed after +44
  if (cleanedPhone.match(/^\+440\d{9,}$/)) {
    cleanedPhone = '+44' + cleanedPhone.substring(4);
    console.log('🔧 Fixed UK number: removed leading 0 after +44:', cleanedPhone);
  }

  // Handle numbers starting with country dialing code but no +
  // e.g., "447595566608" for UK, "12025551234" for US
  if (!cleanedPhone.startsWith('+')) {
    // First check if it already starts with a known country dialing code
    // This handles cases where phone is stored with country code but no +
    const knownDialingCodes = ['44', '1', '49', '33', '34', '39', '31', '91', '86', '81', '61', '64', '353'];
    let detectedDialingCode: string | null = null;

    for (const code of knownDialingCodes) {
      if (cleanedPhone.startsWith(code) && cleanedPhone.length > code.length + 8) {
        detectedDialingCode = code;
        break;
      }
    }

    if (detectedDialingCode) {
      cleanedPhone = '+' + cleanedPhone;
      console.log('📞 Added + prefix to number with detected country code:', cleanedPhone);
    }
    // Check if it starts with the contact's country dialing code
    else if (cleanedPhone.startsWith(dialingCode) && cleanedPhone.length > dialingCode.length + 8) {
      cleanedPhone = '+' + cleanedPhone;
      console.log('📞 Added + prefix to number starting with dialing code:', cleanedPhone);
    }
    // Handle local formats with leading 0 (common in UK, Germany, etc.)
    else if (cleanedPhone.startsWith('0')) {
      // Remove leading 0 and add country code
      cleanedPhone = '+' + dialingCode + cleanedPhone.substring(1);
      console.log('📞 Converted local format (0xxx) to international:', cleanedPhone);
    }
    // Handle numbers without any prefix - assume they need country code
    else if (cleanedPhone.match(/^\d{6,}$/)) {
      // US/CA numbers are typically 10 digits, UK landlines 10-11, mobiles 10
      if (countryCode === 'US' || countryCode === 'CA') {
        // US/Canada: 10 digit numbers
        if (cleanedPhone.length === 10) {
          cleanedPhone = '+1' + cleanedPhone;
          console.log('📞 Added US/CA country code:', cleanedPhone);
        } else {
          // Number doesn't look like US format, try to detect country from leading digits
          if (cleanedPhone.startsWith('44') && cleanedPhone.length >= 11) {
            cleanedPhone = '+' + cleanedPhone; // UK number stored without +
            console.log('📞 Detected UK number (starts with 44):', cleanedPhone);
          } else {
            cleanedPhone = '+1' + cleanedPhone;
            console.log('📞 Added US/CA country code (fallback):', cleanedPhone);
          }
        }
      } else if (countryCode === 'GB') {
        // UK: typically 10-11 digits after country code
        cleanedPhone = '+44' + cleanedPhone;
        console.log('📞 Added UK country code:', cleanedPhone);
      } else {
        // Other countries: add the dialing code
        cleanedPhone = '+' + dialingCode + cleanedPhone;
        console.log('📞 Added country dialing code:', cleanedPhone);
      }
    }
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(cleanedPhone, countryCode as any);
    if (phoneNumber && phoneNumber.isValid()) {
      console.log('✅ Valid E.164 number:', phoneNumber.number);
      return phoneNumber.number;
    } else if (phoneNumber) {
      console.log('⚠️ Phone parsed but invalid:', phoneNumber.number, 'isPossible:', phoneNumber.isPossible());
      // If it's possible but not valid, still return it (might work for some edge cases)
      if (phoneNumber.isPossible()) {
        return phoneNumber.number;
      }
    }
  } catch (error) {
    console.error('Phone normalization error:', error);
  }

  // Last resort: if number starts with + and has reasonable length, return as-is
  if (cleanedPhone.startsWith('+') && cleanedPhone.length >= 10 && cleanedPhone.length <= 16) {
    console.log('⚠️ Returning unvalidated E.164 format:', cleanedPhone);
    return cleanedPhone;
  }

  console.log('❌ Could not normalize phone number');
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

  // Contact Mismatch (Wrong Person Answered) state
  const [showContactMismatch, setShowContactMismatch] = useState(false);
  const [switchedContact, setSwitchedContact] = useState<{ id: string; fullName: string } | null>(null);
  const [activeCallAttemptId, setActiveCallAttemptId] = useState<string | null>(null);

  // Lead Verification Modal state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationLeadId, setVerificationLeadId] = useState<string | null>(null);

  // Audio Device Settings state
  const [showAudioSettings, setShowAudioSettings] = useState(false);

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

  // Call Control API hook for click-to-call functionality
  const {
    isConnected,
    callState,
    callDuration,
    isMuted,
    callControlId,
    formatDuration: formatCallControlDuration,
    makeCall: apiMakeCall,
    hangup: apiHangup,
    toggleMute,
    toggleHold,
    sendDTMF,
    transferCall,
  } = useCallControl({
    onCallStateChange: (newState) => {
      console.log('[AGENT CONSOLE] Call Control state changed:', newState);
      // Map Call Control states to our local states
      if (newState === 'hangup') {
        setCallStatus('wrap-up');
      } else if (newState === 'calling_agent' || newState === 'agent_connected' || newState === 'calling_prospect') {
        setCallStatus('connecting');
      } else {
        setCallStatus(newState as CallStatus);
      }
    },
    onCallEnd: () => {
      console.log('[AGENT CONSOLE] Call Control call ended');
      setCallStatus('wrap-up');
    },
  });

  // Log connection state changes
  useEffect(() => {
    console.log('[AGENT CONSOLE] Call Control state:', {
      isConnected,
      callState,
      callControlId,
    });
  }, [isConnected, callState, callControlId]);

  // Fetch SIP trunk credentials for WebRTC
  const { data: sipTrunkConfig, isLoading: sipLoading, error: sipError } = useQuery<{
    sipUsername: string;
    sipPassword: string;
    sipDomain: string;
    connectionId?: string;
  }>({
    queryKey: ['/api/sip-trunks/default'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Debug SIP trunk config fetch
  useEffect(() => {
    console.log('[AGENT CONSOLE] SIP Trunk Config Status:', {
      isLoading: sipLoading,
      data: sipTrunkConfig,
      error: sipError,
      hasUsername: !!sipTrunkConfig?.sipUsername,
      hasPassword: !!sipTrunkConfig?.sipPassword,
    });
  }, [sipTrunkConfig, sipLoading, sipError]);

  // Notify user if SIP credentials are missing (WebRTC will be disabled)
  const [sipWarned, setSipWarned] = useState(false);
  useEffect(() => {
    if (sipLoading) {
      console.log('[AGENT CONSOLE] Still loading SIP credentials...');
      return;
    }

    const missing = !sipTrunkConfig?.sipUsername || !sipTrunkConfig?.sipPassword;
    if (missing && !sipWarned) {
      console.warn('WebRTC initialization skipped: Missing SIP credentials');
      console.warn('[AGENT CONSOLE] SIP config:', sipTrunkConfig);
      console.warn('[AGENT CONSOLE] Error:', sipError);
      toast({
        variant: 'destructive',
        title: 'WebRTC Disabled',
        description: 'Missing SIP credentials. Click-to-call will use callback mode.',
        duration: 8000,
      });
      setSipWarned(true);
    }
  }, [sipTrunkConfig, sipLoading, sipError, sipWarned, toast]);

  const sipUri = useMemo(() => {
    if (!sipTrunkConfig?.sipUsername || !sipTrunkConfig?.sipDomain) return undefined;
    return `sip:${sipTrunkConfig.sipUsername}@${sipTrunkConfig.sipDomain}`;
  }, [sipTrunkConfig?.sipUsername, sipTrunkConfig?.sipDomain]);

  // Telnyx WebRTC connection for browser-based audio
  const {
    isConnected: webrtcConnected,
    callState: webrtcCallState,
    callDuration: webrtcCallDuration,
    makeCall: webrtcMakeCall,
    hangup: webrtcHangup,
    toggleMute: webrtcToggleMute,
    toggleHold: webrtcToggleHold,
    isMuted: webrtcIsMuted,
    lastError: webrtcError,
    telnyxCallId,
    sendDTMF: webrtcSendDTMF,
    setAudioDevices,
    formatDuration: formatWebRTCDuration,
  } = useSIPWebRTC({
    sipUri,
    sipPassword: sipTrunkConfig?.sipPassword,
    onCallStateChange: (state) => {
      console.log('[AGENT CONSOLE] WebRTC call state changed to:', state);
    },
    onCallEnd: () => {
      console.log('[AGENT CONSOLE] WebRTC call ended');
    },
  });

  // Log WebRTC connection status
  useEffect(() => {
    console.log('[AGENT CONSOLE] WebRTC status:', {
      webrtcConnected,
      webrtcCallState,
      webrtcError,
    });
  }, [webrtcConnected, webrtcCallState, webrtcError]);

  // Sync WebRTC call status with component callStatus
  useEffect(() => {
    if (webrtcConnected && webrtcCallState) {
      console.log('[AGENT CONSOLE] Syncing WebRTC status to callStatus:', webrtcCallState);
      // Map WebRTC statuses to our CallStatus type
      switch (webrtcCallState) {
        case 'connecting':
        case 'ringing':
          setCallStatus('connecting');
          break;
        case 'active':
          setCallStatus('active');
          break;
        case 'held':
          setCallStatus('held');
          break;
        case 'hangup':
          setCallStatus('wrap-up');
          break;
        case 'idle':
          // Don't change to idle automatically - let wrap-up complete first
          break;
      }
    }
  }, [webrtcConnected, webrtcCallState]);

  const activeCallDuration = webrtcConnected ? webrtcCallDuration : callDuration;
  const formatActiveDuration = () => {
    if (webrtcConnected) {
      return formatWebRTCDuration();
    }
    return formatCallControlDuration();
  };

  // Additional UI state
  const [isHeld, setIsHeld] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferNumber, setTransferNumber] = useState('');
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Transfer call to another number via Call Control API
  const handleTransfer = async () => {
    if (!transferNumber) {
      toast({
        title: "No Transfer Number",
        description: "Please enter a phone number to transfer to.",
        variant: "destructive",
      });
      return;
    }

    await transferCall(transferNumber);
    setShowTransferDialog(false);
    setTransferNumber('');
  };

  // Call initiation - uses SIP WebSocket when connected, falls back to Call Control API
  const makeCall = async (phoneNumber: string, options?: { campaignId?: string; contactId?: string; queueItemId?: string }) => {
    console.log('[AGENT CONSOLE] makeCall invoked:', {
      phoneNumber,
      isConnected,
      webrtcConnected,
      options,
    });

    // Set connecting status immediately so UI shows hang up button
    setCallStatus('connecting');

    // Primary path: WebRTC softphone for in-browser audio
    if (webrtcConnected && webrtcMakeCall) {
      try {
        console.log('[AGENT CONSOLE] Using WebRTC softphone for call to:', phoneNumber);
        await webrtcMakeCall(phoneNumber);
        return;
      } catch (err) {
        console.error('[AGENT CONSOLE] WebRTC call failed, falling back to Call Control API', err);
        toast({
          variant: 'destructive',
          title: 'WebRTC issue',
          description: 'Falling back to phone callback mode.',
          duration: 6000,
        });
      }
    } else {
      console.log('[AGENT CONSOLE] WebRTC not connected - falling back to Call Control API');
    }

    // Fallback: Call Control REST API (will ring agent phone if configured)
    await apiMakeCall(phoneNumber, {
      campaignId: options?.campaignId || selectedCampaignId,
      contactId: options?.contactId,
      queueItemId: options?.queueItemId,
      mode: 'direct',
    });
  };

  // Hangup call - uses SIP WebSocket when active, falls back to Call Control API
  const hangup = async () => {
    console.log('[AGENT CONSOLE] Hanging up call', {
      webrtcConnected,
      webrtcCallState,
      callControlId,
      callState,
    });

    // Check if we have an active Call Control API call
    const hasActiveCallControlCall = callControlId && callState !== 'idle' && callState !== 'hangup';

    // Use SIP hangup only if SIP is active AND we don't have a Call Control call
    if (webrtcConnected && webrtcHangup && webrtcCallState !== 'idle' && !hasActiveCallControlCall) {
      console.log('[AGENT CONSOLE] Using WebRTC hangup');
      webrtcHangup();
    } else if (hasActiveCallControlCall) {
      // Use Call Control API hangup when we have an active call control ID
      console.log('[AGENT CONSOLE] Using Call Control API hangup for:', callControlId);
      await apiHangup();
    } else {
      // Fallback - try both just in case
      console.log('[AGENT CONSOLE] Fallback hangup - trying both methods');
      if (webrtcHangup && webrtcCallState !== 'idle') {
        webrtcHangup();
      }
      await apiHangup();
    }

    // Always update local state to ensure UI reflects hangup
    // This ensures the UI updates even if the hook callbacks don't fire
    setIsHeld(false);
    setCallStatus('wrap-up');
    console.log('[AGENT CONSOLE] Call state set to wrap-up');
  };

  // Unified mute handler - uses WebRTC when active, falls back to Call Control API
  const handleToggleMute = async () => {
    // Check if we have an active Call Control API call
    const hasActiveCallControlCall = callControlId && callState !== 'idle' && callState !== 'hangup';

    console.log('[AGENT CONSOLE] Toggling mute', {
      webrtcConnected,
      webrtcCallState,
      callControlId,
      callState,
      hasActiveCallControlCall,
    });

    // Use WebRTC mute only if WebRTC is active AND we don't have a Call Control call
    if (webrtcConnected && webrtcCallState === 'active' && !hasActiveCallControlCall) {
      // Use WebRTC mute/unmute
      console.log('[AGENT CONSOLE] Using WebRTC mute/unmute');
      webrtcToggleMute();
    } else if (hasActiveCallControlCall) {
      // Fall back to API-based mute for Call Control calls
      console.log('[AGENT CONSOLE] Using Call Control API mute for:', callControlId);
      await toggleMute();
    } else {
      // Fallback - try API mute anyway
      console.log('[AGENT CONSOLE] Fallback mute - using API');
      await toggleMute();
    }
  };

  // Unified mute state - prefer Call Control state when we have a call control ID, else WebRTC
  const hasActiveCallControlCall = callControlId && callState !== 'idle' && callState !== 'hangup';
  const isCurrentlyMuted = hasActiveCallControlCall ? isMuted : (webrtcConnected && webrtcCallState === 'active' ? webrtcIsMuted : isMuted);

  // Unified hold handler - uses WebRTC when active, falls back to Call Control API
  const handleToggleHold = async () => {
    console.log('[AGENT CONSOLE] Toggling hold, WebRTC connected:', webrtcConnected, 'WebRTC status:', webrtcCallState);
    if (webrtcConnected && (webrtcCallState === 'active' || webrtcCallState === 'held')) {
      // Use WebRTC hold/unhold
      webrtcToggleHold();
    } else {
      // Fall back to API-based hold
      await toggleHold();
    }
  };

  // Unified hold state - prefer WebRTC state when connected
  const isCurrentlyHeld = webrtcConnected && (webrtcCallState === 'active' || webrtcCallState === 'held') ? (webrtcCallState === 'held') : isHeld;

  // Unified DTMF handler - prefer WebRTC when active
  const handleSendDTMF = (digit: string) => {
    if (webrtcConnected && webrtcCallState === 'active') {
      webrtcSendDTMF?.(digit);
    } else {
      sendDTMF?.(digit);
    }
  };

  // Fetch agent queue data
  const { data: queueData = [], isLoading: queueLoading, refetch: refetchQueue, error: queueError, isFetching: queueFetching, isPlaceholderData } = useQuery<QueueItem[]>({
    queryKey: selectedCampaignId 
      ? [`/api/agents/me/queue?campaignId=${selectedCampaignId}&status=queued`]
      : ['/api/agents/me/queue?status=queued'],
    placeholderData: (previousData) => previousData, // Keep previous data during refetch to prevent UI flickering
    staleTime: 30000, // Consider data fresh for 30 seconds
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
  const currentQueueItem = queueData?.[currentContactIndex];
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
    campaignObjective?: string;
    campaignContextBrief?: string;
    targetAudienceDescription?: string;
    talkingPoints?: string[];
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
        new Map((queueData || []).map(item => [item.campaignId, { id: item.campaignId, name: item.campaignName }])).values()
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
    mutationFn: async (attemptData: { campaignId: string; contactId: string; telnyxCallId: string; dialedNumber: string }) => {
      const response = await apiRequest('POST', '/api/call-attempts/start', attemptData);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || 'Failed to create call attempt');
      }
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
      // Note: callDuration is managed by useSIPWebRTC hook and resets automatically on new calls
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
    const callIdForAttempt = telnyxCallId || callControlId || null;

    if (callStatus === 'active' && callIdForAttempt && !activeCallAttemptId && currentQueueItem) {
      console.log('[CALL-ATTEMPT] Call became active, creating call attempt...', { callId: callIdForAttempt });
      createCallAttemptMutation.mutate({
        campaignId: currentQueueItem.campaignId,
        contactId: switchedContact?.id || currentQueueItem.contactId,
        telnyxCallId: callIdForAttempt,
        dialedNumber: dialedPhoneNumber,
      });
    } else if (callStatus === 'active' && !callIdForAttempt) {
      console.warn('[CALL-ATTEMPT] Skipping call attempt creation: missing call identifier (likely Call Control fallback)');
    }
  }, [callStatus, telnyxCallId, callControlId, activeCallAttemptId, currentQueueItem, switchedContact, dialedPhoneNumber]);

  const handleContactSwitched = (newContact: { id: string; fullName: string }) => {
    setSwitchedContact(newContact);
    toast({
      title: "Contact Updated",
      description: `Now speaking with ${newContact.fullName}`,
    });
  };

  const handleDial = () => {
    // Call Control API is always available, WebRTC optional for audio
    // If WebRTC not connected, will use callback mode
    if (!isConnected && !webrtcConnected) {
      toast({
        title: "Not ready",
        description: "Calling service is not ready. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Show info if WebRTC not connected
    if (!webrtcConnected) {
      console.log('[AGENT CONSOLE] WebRTC not connected - will use callback mode');
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

    // Get the contact's country for proper phone normalization
    // Check contact country first, then account country, then default to US
    const rawCountry = fullContactDetails?.country ||
                       fullContactDetails?.account?.hqCountry ||
                       'US';
    const contactCountry = getCountryCode(rawCountry);

    // Debug logging
    console.log('🔍 Phone Validation Debug:', {
      phoneNumber,
      rawCountry,
      contactCountry,
      phoneType: selectedPhoneType,
      label: phoneLabel,
      contactName: fullContactDetails?.fullName,
    });

    // Use the enhanced normalization function that handles all country formats
    let e164Phone = normalizePhoneToE164(phoneNumber, contactCountry);

    if (!e164Phone) {
      toast({
        title: "Invalid phone number",
        description: `Cannot validate "${phoneNumber}". Please ensure it's in correct format for ${rawCountry}.`,
        variant: "destructive",
      });
      return;
    }

    console.log('✅ E164 Result:', e164Phone);

    if (selectedPhoneType === 'manual') {
      const manualDialNote = `[Manual Dial: ${phoneNumber}]`;
      setNotes(prev => prev ? `${prev}\n${manualDialNote}` : manualDialNote);
    }

    // Store the dialed phone number for later use in disposition
    setDialedPhoneNumber(e164Phone);

    // Pass context for Call Control API (campaign, contact, queue item)
    makeCall(e164Phone, {
      campaignId: selectedCampaignId,
      contactId: currentQueueItem?.contactId,
      queueItemId: currentQueueItem?.id,
    });
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
      duration: activeCallDuration,
      notes,
      qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
      callbackRequested: disposition === 'callback-requested',
      telnyxCallId: telnyxCallId || callControlId, // Prefer WebRTC call ID for recording lookup
      callControlId: callControlId, // Retain for fallback compatibility
      dialedNumber: dialedPhoneNumber, // Include dialed phone number for recording sync
      callAttemptId: activeCallAttemptId, // Include call attempt ID for linking
      // Track contact switch if it happened
      originalContactId: switchedContact ? currentQueueItem.contactId : null,
      actualContactId: switchedContact?.id || null,
      wrongPersonAnswered: !!switchedContact,
    });
  };

  const handleNextContact = () => {
    if (currentContactIndex < (queueData?.length || 0) - 1) {
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
    if (!isConnected && !webrtcConnected) {
      return <Badge variant="destructive" data-testid="badge-not-connected">Disconnected</Badge>;
    }

    switch (callStatus) {
      case 'idle':
        // Show mode in badge - using direct mode (calls prospect directly)
        return <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 shadow-lg" data-testid="badge-call-idle">Ready</Badge>;
      case 'connecting':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-connecting">Connecting...</Badge>;
      case 'ringing':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-ringing">Ringing...</Badge>;
      case 'active':
        return <Badge className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-0 shadow-lg" data-testid="badge-call-active">Active - {formatActiveDuration()}</Badge>;
      case 'held':
        return <Badge variant="outline" className="bg-white/10 text-white border-white/20" data-testid="badge-call-held">On Hold</Badge>;
      case 'wrap-up':
        return <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 shadow-lg" data-testid="badge-call-wrapup">Wrap-Up</Badge>;
      default:
        return null;
    }
  };

  const queueProgress = (queueData?.length || 0) > 0 ? ((currentContactIndex + 1) / (queueData?.length || 1)) * 100 : 0;

  // Show loading state when initially loading (not during background refetch)
  if (queueLoading && !(queueData?.length)) {
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
              <div className="animate-spin w-8 h-8 mx-auto border-4 border-primary border-t-transparent rounded-full mb-4" />
              <p className="text-muted-foreground">Loading queue...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only show empty state when not loading/fetching and queue is actually empty
  // Use both queueLoading and queueFetching to prevent flickering during refetch
  if (!queueLoading && !queueFetching && (!queueData || queueData.length === 0)) {
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
              {selectedCampaign && selectedCampaignId && (
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
      {/* Hidden remote audio element for WebRTC calls - CRITICAL for audio playback */}
      <audio 
        id="remoteAudio"
        autoPlay={true}
        style={{ display: 'none' }}
        playsInline
        controls={false}
      />

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
                <span className="font-mono text-[10px]" data-testid="text-call-duration">{formatActiveDuration()}</span>
              </div>
            )}

            <div className="flex-1"></div>

            {getStatusBadge()}

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
                Contact {currentContactIndex + 1} of {queueData?.length || 0}
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

            {campaignDetails && (dialMode === 'manual' || dialMode === 'ai_agent') && selectedCampaignId && (
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
                Contact {currentContactIndex + 1} of {queueData?.length || 0}
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
                <span className="font-mono text-sm" data-testid="text-call-duration">{formatActiveDuration()}</span>
              </div>
            )}

            {getStatusBadge()}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchQueue()}
              className="text-white hover:bg-white/10"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowAudioSettings(true)}
              className="text-white hover:bg-white/10"
              data-testid="button-audio-settings"
              title="Audio Device Settings"
            >
              <Settings className="h-4 w-4" />
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
                  disabled={currentContactIndex === 0 || (queueData?.length || 0) === 0 || isCallActive || (callMadeToContact && !dispositionSaved)}
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
                    currentContactIndex >= (queueData?.length || 0) - 1 || 
                    (queueData?.length || 0) === 0 ||
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
                  Showing {Math.min(queueData?.length || 0, 15)} of {queueData?.length || 0} contacts
                </div>
                {(queueData || []).slice(0, 15).map((item, index) => {
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleMute}
                    disabled={!isCallActive}
                    className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs"
                    data-testid="button-mute"
                  >
                    {isCurrentlyMuted ? (
                      <><MicOff className="h-3 w-3 mr-1" />Unmute</>
                    ) : (
                      <><Mic className="h-3 w-3 mr-1" />Mute</>
                    )}
                  </Button>

                  {/* Hold Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleHold}
                    disabled={!isCallActive}
                    className={`h-9 backdrop-blur-sm text-xs ${
                      isCurrentlyHeld
                        ? 'bg-amber-500/30 hover:bg-amber-500/40 border-amber-400/50 text-amber-100'
                        : 'bg-white/20 hover:bg-white/30 border-white/30 text-white'
                    }`}
                    data-testid="button-hold"
                  >
                    {isCurrentlyHeld ? (
                      <><Play className="h-3 w-3 mr-1" />Resume</>
                    ) : (
                      <><Pause className="h-3 w-3 mr-1" />Hold</>
                    )}
                  </Button>

                  {/* Transfer Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTransferDialog(true)}
                    disabled={!isCallActive}
                    className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs"
                    data-testid="button-transfer"
                  >
                    <PhoneForwarded className="h-3 w-3 mr-1" />
                    Transfer
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

                  <div className="flex-1 min-w-[120px]">
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
                              onClick={() => handleSendDTMF(digit)}
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
                    onClick={handleToggleMute}
                    disabled={!isCallActive}
                    className="bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-sm"
                    data-testid="button-mute"
                  >
                    {isCurrentlyMuted ? (
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
                              onClick={() => handleSendDTMF(digit)}
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
              <div className="flex-1 min-h-0 overflow-auto">
                {/* Campaign Context Section */}
                {(campaignDetails?.campaignObjective || campaignDetails?.campaignContextBrief || (campaignDetails?.talkingPoints && campaignDetails.talkingPoints.length > 0)) && (
                  <div className="border-b">
                    <div className="px-6 py-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                          <Target className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-base text-foreground">Campaign Context</h3>
                          <p className="text-xs text-muted-foreground">Background & key messaging points</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-6 space-y-4">
                      {/* Objective */}
                      {campaignDetails?.campaignObjective && (
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Objective</Badge>
                          </h4>
                          <p className="text-sm text-foreground/80 leading-relaxed">{campaignDetails.campaignObjective}</p>
                        </div>
                      )}

                      {/* Context Brief */}
                      {campaignDetails?.campaignContextBrief && (
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Brief</Badge>
                          </h4>
                          <p className="text-sm text-foreground/80 leading-relaxed">{campaignDetails.campaignContextBrief}</p>
                        </div>
                      )}

                      {/* Talking Points */}
                      {campaignDetails?.talkingPoints && campaignDetails.talkingPoints.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Talking Points</Badge>
                          </h4>
                          <ul className="space-y-2">
                            {campaignDetails.talkingPoints.map((point, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-foreground/80">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Call Script Section */}
                <div className="flex-shrink-0 px-6 py-4 border-b bg-muted/30">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-base text-foreground">Call Script</h3>
                  </div>
                </div>
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

                    {activeCallDuration > 0 && (
                      <div className="text-sm text-muted-foreground">
                        Call duration: {Math.floor(activeCallDuration / 60)}:{(activeCallDuration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

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
              duration: activeCallDuration,
              notes,
              qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
              callbackRequested: false,
              callControlId: callControlId,
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

      {/* Transfer Call Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneForwarded className="h-5 w-5" />
              Transfer Call
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-number">Transfer to phone number</Label>
              <Input
                id="transfer-number"
                placeholder="+1 (555) 123-4567"
                value={transferNumber}
                onChange={(e) => setTransferNumber(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter the phone number to transfer this call to. Use E.164 format for best results.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!transferNumber.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <PhoneForwarded className="h-4 w-4 mr-2" />
              Transfer Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audio Device Settings Dialog */}
      <AudioDeviceSettings 
        open={showAudioSettings}
        onOpenChange={setShowAudioSettings}
        onDevicesSelected={(micId, speakerId) => {
          console.log('[AUDIO SETTINGS] Devices selected:', { micId, speakerId });
          // Apply to the active WebRTC session and persist via the component
          setAudioDevices?.(micId, speakerId);
        }}
      />
    </div>
  );
}
