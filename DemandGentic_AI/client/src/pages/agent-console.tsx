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
const COUNTRY_NAME_TO_CODE: Record = {
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
const COUNTRY_DIALING_CODES: Record = {
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
  // But reject obviously invalid/placeholder numbers (all zeros, repeated digits)
  if (cleanedPhone.startsWith('+') && cleanedPhone.length >= 10 && cleanedPhone.length = 11) {
    subscriberDigits = digits.substring(1);
  } else if (digits.length >= 10) {
    subscriberDigits = digits.substring(2);
  }

  // All zeros in subscriber part (e.g. +44000000000)
  if (/^0+$/.test(subscriberDigits)) return true;
  // Single repeated digit (e.g. +44111111111)
  if (subscriberDigits.length >= 7 && /^(.)\1+$/.test(subscriberDigits)) return true;
  // Entire number is all zeros
  if (/^0+$/.test(digits)) return true;

  return false;
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

function normalizeDispositionForSubmit(rawDisposition: string): string {
  const normalized = rawDisposition.trim().toLowerCase();
  const map: Record = {
    'callback-requested': 'callback-requested',
    'callback_requested': 'callback-requested',
    'call back': 'callback-requested',
    'call_back': 'callback-requested',
    'not_interested': 'not_interested',
    'not-interested': 'not_interested',
    'dnc-request': 'dnc-request',
    'do_not_call': 'dnc-request',
    'do-not-call': 'dnc-request',
    'invalid_data': 'invalid_data',
    'invalid-data': 'invalid_data',
    'no_answer': 'no-answer',
    'no-answer': 'no-answer',
    'wrong_number': 'wrong_number',
    'wrong-number': 'wrong_number',
    'busy': 'busy',
    'voicemail': 'voicemail',
    'qualified': 'qualified',
    'lead': 'lead',
  };

  return map[normalized] || normalized;
}

// Format phone number for human-readable display using libphonenumber-js
// e.g., "+441908802874" → "+44 1908 802874", "+12025551234" → "+1 202 555 1234"
function formatPhoneForDisplay(phone: string | null, country?: string | null): string {
  if (!phone) return '';
  try {
    // Try parsing with country hint first, then without
    const countryCode = country ? getCountryCode(country) : undefined;
    const parsed = parsePhoneNumberFromString(phone, countryCode as any);
    if (parsed) {
      return parsed.formatInternational();
    }
  } catch {
    // Parsing failed, fall through
  }
  // Fallback: return the raw phone as-is
  return phone;
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
  contactCountry: string | null;
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
  const [callStatus, setCallStatus] = useState('idle');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [selectedPhoneType, setSelectedPhoneType] = useState('direct');
  const [manualPhoneNumber, setManualPhoneNumber] = useState('');
  const [showManualDial, setShowManualDial] = useState(false);
  const [dialedPhoneNumber, setDialedPhoneNumber] = useState(''); // Track actual dialed number

  // Disposition form state
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');
  const [qualificationData, setQualificationData] = useState({});
  const [dispositionSaved, setDispositionSaved] = useState(false);
  const [dispositionSubmitState, setDispositionSubmitState] = useState('idle');
  const [dispositionSubmitMessage, setDispositionSubmitMessage] = useState('');
  const [callMadeToContact, setCallMadeToContact] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);

  // Contact Mismatch (Wrong Person Answered) state
  const [showContactMismatch, setShowContactMismatch] = useState(false);
  const [switchedContact, setSwitchedContact] = useState(null);
  const [activeCallAttemptId, setActiveCallAttemptId] = useState(null);

  // Lead Verification Modal state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationLeadId, setVerificationLeadId] = useState(null);

  // Audio Device Settings state
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  
  // Restrictive Network Mode (for Pakistan, China, etc.)
  const [restrictiveNetworkMode, setRestrictiveNetworkMode] = useState(() => {
    // Load from localStorage on initial render
    if (typeof window !== 'undefined') {
      return localStorage.getItem('telnyx_restrictive_network_mode') === 'true';
    }
    return false;
  });

  // Fetch agent's active campaign assignment (poll every 10s to detect reassignments)
  const { data: activeCampaign } = useQuery({
    queryKey: ['/api/agents/me/active-campaign'],
    refetchInterval: 30000, // Reduced from 10s to 30s - assignments don't change frequently
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
  });

  // Track the last known active campaign to detect real reassignments vs refetch noise
  const prevActiveCampaignRef = useRef(null);

  // Auto-select active campaign on initial load, and switch only on real reassignment
  useEffect(() => {
    if (!activeCampaign?.campaignId) return;

    const isInitialLoad = prevActiveCampaignRef.current === null;
    const isReassignment = prevActiveCampaignRef.current !== null && prevActiveCampaignRef.current !== activeCampaign.campaignId;

    if (isInitialLoad || isReassignment) {
      console.log('[AGENT CONSOLE] Active campaign changed, switching to:', activeCampaign.campaignId, activeCampaign.campaignName);
      setSelectedCampaignId(activeCampaign.campaignId);
    }

    prevActiveCampaignRef.current = activeCampaign.campaignId;
  }, [activeCampaign?.campaignId]);

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
  const { data: sipTrunkConfig, isLoading: sipLoading, error: sipError } = useQuery({
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
    restrictiveNetworkMode, // Enable for Pakistan, China, etc.
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
      restrictiveNetworkMode,
    });
  }, [webrtcConnected, webrtcCallState, webrtcError, restrictiveNetworkMode]);

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
  const callTimerRef = useRef(null);

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

  // Fetch agent queue data — only when a campaign is selected to prevent layout shifts
  const { data: queueData = [], isLoading: queueLoading, refetch: refetchQueue, error: queueError, isFetching: queueFetching, isPlaceholderData } = useQuery({
    queryKey: [`/api/agents/me/queue?campaignId=${selectedCampaignId}&status=queued`],
    enabled: !!selectedCampaignId,
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
  const { data: contactDetails } = useQuery({
    queryKey: currentQueueItem ? [`/api/contacts/${currentQueueItem.contactId}`] : [],
    enabled: !!currentQueueItem?.contactId,
  });

  // Compute valid phone options from queue item (already has best phone selected)
  const validPhoneOptions = useMemo(() => {
    if (!currentQueueItem?.contactPhone) return [];

    // Reject obviously invalid/placeholder phone numbers (e.g. 44 000000000)
    if (isObviouslyInvalidPhone(currentQueueItem.contactPhone)) {
      console.warn('⚠️ Skipping invalid/placeholder phone:', currentQueueItem.contactPhone);
      return [];
    }

    const options: Array = [];

    // Queue already provides the best phone and its type
    const phoneLabel = currentQueueItem.phoneType
      ? getPhoneTypeLabel(currentQueueItem.phoneType)
      : 'Phone';

    // Format the phone number for human-readable display with country context
    const displayPhone = formatPhoneForDisplay(
      currentQueueItem.contactPhone,
      currentQueueItem.contactCountry
    );

    options.push({
      type: currentQueueItem.phoneType === 'hq' ? 'company' : 'direct',
      number: currentQueueItem.contactPhone,
      label: `${phoneLabel}: ${displayPhone}`
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
  const { data: campaignDetails } = useQuery;
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
  const { data: assignedScript } = useQuery({
    queryKey: campaignDetails?.scriptId ? [`/api/call-scripts/${campaignDetails.scriptId}`] : [],
    enabled: !!campaignDetails?.scriptId,
  });

  // Fetch full contact details for the current queue item
  const { data: fullContactDetails } = useQuery({
    queryKey: currentQueueItem?.contactId ? [`/api/contacts/${currentQueueItem.contactId}`] : [],
    enabled: !!currentQueueItem?.contactId,
  });

  const dialMode = campaignDetails?.dialMode || 'manual';
  const amdEnabled = campaignDetails?.hybridSettings?.amd?.enabled ?? false;

  // Fetch related contacts from the same company
  const { data: relatedContacts = [] } = useQuery>({
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
        return ;
      }
      if (bullet.includes('★') || bullet.includes('⭐')) {
        return ;
      }
      if (bullet.includes('→') || bullet.includes('➜')) {
        return ;
      }
      if (bullet.includes('○') || bullet.includes('◦')) {
        return ;
      }

      // Numbered bullets
      if (bullet.match(/\d+\./)) {
        const num = bullet.replace('.', '');
        return (
          
            {num}
          
        );
      }

      // Default bullet
      return ;
    };

    // Split into paragraphs (double line breaks)
    const paragraphs = script.split(/\n\n+/);

    return (
      
        {paragraphs.map((paragraph, pIndex) => {
          const lines = paragraph.split('\n').filter(l => l.trim());
          if (lines.length === 0) return null;

          // Check if this paragraph has bullets
          const hasBullets = lines.some(line => line.match(/^(\s*)([-*•✓✔★⭐→➜○◦]|\d+\.)\s+/));

          return (
            
              {lines.map((line, lineIndex) => {
                const bulletMatch = line.match(/^(\s*)([-*•✓✔★⭐→➜○◦]|\d+\.)\s+(.*)$/);

                if (bulletMatch) {
                  const [, indent, bullet, content] = bulletMatch;
                  const indentLevel = indent.length / 2;

                  return (
                    
                      
                        {getBulletIcon(bullet)}
                      
                      
                        {renderLineWithBoldPlaceholders(content)}
                      
                    
                  );
                }

                // Regular line - headings are bold and larger
                const isHeading = lineIndex === 0 && !hasBullets;
                return (
                  
                    {renderLineWithBoldPlaceholders(line)}
                  
                );
              })}
            
          );
        })}
      
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
          
            {replacedValue}
          
        );
      }
      return {part};
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

  // Get agent's assigned campaigns (poll to detect reassignments)
  const { data: agentAssignments = [] } = useQuery>({
    queryKey: ['/api/campaigns/agent-assignments'],
    refetchInterval: 30000, // Reduced from 10s to 30s - assignments don't change frequently
    refetchIntervalInBackground: false, // Don't poll when tab is inactive
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
    setDispositionSubmitState('idle');
    setDispositionSubmitMessage('');
    setCallMadeToContact(false);
    setDisposition('');
    setNotes('');
    setQualificationData({});
  }, [currentQueueItem?.id]);

  useEffect(() => {
    if (dispositionSubmitState !== 'success') return;

    const timer = setTimeout(() => {
      setDispositionSubmitState('idle');
      setDispositionSubmitMessage('');
    }, 3500);

    return () => clearTimeout(timer);
  }, [dispositionSubmitState]);

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
    onMutate: () => {
      setDispositionSubmitState('saving');
      setDispositionSubmitMessage('Saving disposition...');
    },
    onSuccess: () => {
      toast({
        title: "Disposition saved",
        description: "Call disposition has been recorded successfully.",
      });

      setDispositionSubmitState('success');
      setDispositionSubmitMessage('Disposition saved. Loading next contact...');

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
      setDispositionSubmitState('error');
      setDispositionSubmitMessage(error?.message || 'Failed to save disposition. Please try again.');
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
      // Use the already-normalized phone from queue (getBestPhoneForContact on server)
      // Fall back to raw contactDetails only if queue phone not available
      phoneNumber = currentQueueItem?.contactPhone || contactDetails?.directPhone || null;
      phoneLabel = 'Direct Phone';
    } else if (selectedPhoneType === 'company') {
      phoneNumber = currentQueueItem?.contactPhone || contactDetails?.account?.mainPhone || null;
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
    // Check contact country first, then queue item country, then account country, then default to US
    const rawCountry = fullContactDetails?.country ||
                       currentQueueItem?.contactCountry ||
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

  const handleSaveDisposition = async () => {
    if (!disposition) {
      setDispositionSubmitState('error');
      setDispositionSubmitMessage('Please select a disposition before saving.');
      toast({
        title: "Disposition required",
        description: "Please select a call disposition before proceeding.",
        variant: "destructive",
      });
      return;
    }

    if (!currentQueueItem) {
      setDispositionSubmitState('error');
      setDispositionSubmitMessage('No contact selected. Please refresh and try again.');
      toast({
        title: "Error",
        description: "No contact selected",
        variant: "destructive",
      });
      return;
    }

    if (saveDispositionMutation.isPending) {
      return;
    }

    setDispositionSubmitState('idle');
    setDispositionSubmitMessage('');

    const dispositionForSubmit = normalizeDispositionForSubmit(disposition);
    const hasActiveCall = ['connecting', 'ringing', 'active', 'held'].includes(callStatus);

    if (hasActiveCall) {
      await hangup();
    }

    saveDispositionMutation.mutate({
      queueItemId: currentQueueItem.id,
      campaignId: currentQueueItem.campaignId,
      contactId: switchedContact?.id || currentQueueItem.contactId, // Use switched contact if present
      disposition: dispositionForSubmit,
      duration: activeCallDuration,
      notes,
      qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
      callbackRequested: dispositionForSubmit === 'callback-requested',
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
    if (currentContactIndex  {
    if (currentContactIndex > 0) {
      setCurrentContactIndex(currentContactIndex - 1);
    }
  };

  const isCallActive = ['connecting', 'ringing', 'active', 'held'].includes(callStatus);

  const displayContactName = switchedContact?.fullName || fullContactDetails?.fullName || currentQueueItem?.contactName || 'Unknown Contact';
  const displayJobTitle = fullContactDetails?.jobTitle || contactDetails?.jobTitle || 'No title';
  const displayCompanyName = fullContactDetails?.account?.name || currentQueueItem?.accountName || 'No company';
  const displayEmail = fullContactDetails?.email || currentQueueItem?.contactEmail || contactDetails?.email || 'No email';

  const getStatusBadge = () => {
    if (!isConnected && !webrtcConnected) {
      return Disconnected;
    }

    // Show restrictive network mode indicator
    const networkIndicator = restrictiveNetworkMode ? (
      
        🌐 Relay
      
    ) : null;

    switch (callStatus) {
      case 'idle':
        // Show mode in badge - using direct mode (calls prospect directly)
        return (
          
            Ready
            {networkIndicator}
          
        );
      case 'connecting':
        return Connecting...;
      case 'ringing':
        return Ringing...;
      case 'active':
        return Active - {formatActiveDuration()};
      case 'held':
        return On Hold;
      case 'wrap-up':
        return Wrap-Up;
      default:
        return null;
    }
  };

  // Show loading state while waiting for campaign selection or initial queue load
  if (!selectedCampaignId || (queueLoading && !(queueData?.length))) {
    return (
      
        
          Agent Console
        
        
          
            
              
              
                {!selectedCampaignId ? 'Loading campaign...' : 'Loading queue...'}
              
            
          
        
      
    );
  }

  // Only show empty state when not loading/fetching and queue is actually empty
  // Use both queueLoading and queueFetching to prevent flickering during refetch
  if (!queueLoading && !queueFetching && (!queueData || queueData.length === 0)) {
    return (
      
        
          Agent Console
          {selectedCampaign && (
            
              Campaign: {selectedCampaign.name}
            
          )}
        
        
          
            
              
              Queue is empty
              
                {selectedCampaign 
                  ? "No contacts available in this campaign's queue"
                  : "Please select a campaign to start calling"}
              
              {!selectedCampaign && campaigns && campaigns.length > 0 && (
                
                  Select a campaign:
                  
                    
                      
                    
                    
                      {campaigns.map((c) => (
                        {c.name}
                      ))}
                    
                  
                
              )}
              {selectedCampaign && selectedCampaignId && (
                
                  
                    Queue is managed by the unified intelligent queue system. Contacts will be automatically assigned and prioritized.
                  
                   {
                      refetchQueue();
                      toast({
                        title: "Queue Updated",
                        description: "Your queue has been refreshed",
                      });
                    }}
                  />
                
              )}
            
          
        
      
    );
  }

  return (
    
      {/* Hidden remote audio element for WebRTC calls - CRITICAL for audio playback */}
      

      {/* TOP FIXED HEADER - Premium Gradient Design - IMPROVED RESPONSIVE */}
      
        {/* Decorative overlay */}
        
        

        {/* Compact Mobile Header */}
        
          {/* Row 1: Title & Campaign Selector */}
          
            
              Agent Console
              
                {campaignDetails?.name || 'Select a campaign'}
              
            
            
              
                
              
              
                {campaigns.map(campaign => (
                  
                    {campaign.name}
                  
                ))}
              
            
          

          {/* Row 2: Status Badges & Controls */}
          
            {campaignDetails && dialMode && (
              
                {dialMode === 'hybrid' ?  : }
                {dialMode === 'hybrid' ? 'Hybrid' : dialMode === 'ai_agent' ? 'AI Agent' : 'Manual'}
              
            )}

            {callStatus === 'active' && (
              
                
                {formatActiveDuration()}
              
            )}

            

            {getStatusBadge()}

             refetchQueue()}
              className="h-10 w-10 p-0 text-white hover:bg-white/10"
              data-testid="button-refresh"
            >
              
            

             setShowAudioSettings(true)}
              className="h-10 w-10 p-0 text-white hover:bg-white/10"
              data-testid="button-audio-settings-mobile"
              title="Audio Device Settings"
            >
              
            
          


        

        {/* Desktop Header - Original Layout */}
        
          {/* Left: Title & Queue Management */}
          
            
              Agent Console
              
                {campaignDetails?.name || 'Select a campaign'}
              
            

            {campaignDetails && (dialMode === 'manual' || dialMode === 'ai_agent') && selectedCampaignId && (
              <>
                
                 {
                    refetchQueue();
                    toast({
                      title: "Queue Updated",
                      description: "Your queue has been refreshed",
                    });
                  }}
                />
              
            )}
          



          {/* Right: Status & Controls */}
          
            
              
                
              
              
                {campaigns.map(campaign => (
                  
                    {campaign.name}
                  
                ))}
              
            

            {campaignDetails && dialMode && (
              
                {dialMode === 'hybrid' ?  : }
                {dialMode === 'hybrid' ? 'Hybrid' : dialMode === 'ai_agent' ? 'AI Agent' : 'Manual'}
              
            )}

            {campaignDetails && dialMode === 'hybrid' && amdEnabled && (
              
                
                AMD
              
            )}

            {callStatus === 'active' && (
              
                
                {formatActiveDuration()}
              
            )}

            {getStatusBadge()}

             refetchQueue()}
              className="text-white hover:bg-white/10"
              data-testid="button-refresh"
            >
              
            

             setShowAudioSettings(true)}
              className="text-white hover:bg-white/10"
              data-testid="button-audio-settings"
              title="Audio Device Settings"
            >
              
            
          
        
      

      {/* MAIN BODY GRID */}
      
        {/* LEFT SIDEBAR: Queue - Modern Glass Design */}
        
          
            
            
              
                
                  
                
                Queue
              
              
                
                  
                
                = (queueData?.length || 0) - 1 || 
                    (queueData?.length || 0) === 0 ||
                    isCallActive ||
                    (callMadeToContact && !dispositionSaved)
                  }
                  className="flex-1 bg-white/90 hover:bg-white border-0 text-foreground font-medium shadow-lg hover:shadow-xl transition-all"
                  data-testid="button-next-contact"
                >
                  
                
              
            
          

          {/* Queue List - No scrolling, fits viewport */}
          
            {queueLoading ? (
              
                
                Loading...
              
            ) : (
              <>
                
                  Showing {Math.min(queueData?.length || 0, 15)} of {queueData?.length || 0} contacts
                
                {(queueData || []).slice(0, 15).map((item, index) => {
                  const isDisabled = (isCallActive || (callMadeToContact && !dispositionSaved)) && index !== currentContactIndex;
                  const isActive = index === currentContactIndex;
                  return (
                     !isDisabled && setCurrentContactIndex(index)}
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
                        
                      )}
                      
                        
                        
                          
                            {item.contactName}
                          
                          {item.accountName}
                        
                      
                    
                  );
                })}
              
            )}
          
        

        {/* RIGHT MAIN SECTION (82% width) */}
        
          {/* CONTACT INFORMATION BAR - Premium Card Design - IMPROVED RESPONSIVE */}
          {currentQueueItem ? (
            
              
              

              {/* Mobile Layout */}
              
                {/* Row 1: Profile & Name */}
                
                  
                    
                      
                    
                    
                  
                  
                    
                      {displayContactName}
                    
                    
                      
                      
                        {displayJobTitle}
                      
                    
                  
                

                {/* Row 2: Company & Email */}
                
                  
                    
                    
                      {displayCompanyName}
                    
                  
                  
                    
                    
                      {displayEmail}
                    
                  
                

                {/* Row 3: Phone Selector */}
                
                  
                   {
                    setSelectedPhoneType(value);
                    setShowManualDial(value === 'manual');
                  }}>
                    
                      
                    
                    
                      {validPhoneOptions.map((option) => (
                        
                          {option.label}
                        
                      ))}
                      
                        Manual Dial
                      
                    
                  
                
                {validPhoneOptions.length === 0 && !showManualDial && (
                  No direct phone available — use Manual Dial
                )}

                {/* Manual Phone Input */}
                {showManualDial && (
                  
                    
                     setManualPhoneNumber(e.target.value)}
                      data-testid="input-manual-phone"
                    />
                  
                )}

                {/* Row 4: Call Controls */}
                
                  
                    {isCurrentlyMuted ? (
                      <>Unmute
                    ) : (
                      <>Mute
                    )}
                  

                  {/* Hold Button */}
                  
                    {isCurrentlyHeld ? (
                      <>Resume
                    ) : (
                      <>Hold
                    )}
                  

                  {/* Transfer Button */}
                   setShowTransferDialog(true)}
                    disabled={!isCallActive}
                    className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs flex-1 sm:flex-none"
                    data-testid="button-transfer"
                  >
                    
                    Transfer
                  

                  {callStatus === 'active' && activeCallAttemptId && (
                     setShowContactMismatch(true)}
                      className="h-9 bg-white/20 hover:bg-white/30 border-white/30 text-white backdrop-blur-sm text-xs flex-1 sm:flex-none"
                      data-testid="button-wrong-person"
                    >
                      
                      Wrong Person
                    
                  )}

                  
                    {!isCallActive && callStatus !== 'wrap-up' && (
                      
                        
                        Call Now
                      
                    )}

                    {isCallActive && (
                      
                        
                        Hang Up
                      
                    )}

                    {callStatus === 'wrap-up' && (
                      
                        Complete disposition below
                      
                    )}
                  
                

                {/* DTMF Keypad Toggle & Keypad - Shows during active call */}
                {callStatus === 'active' && (
                  
                     setShowKeypad(!showKeypad)}
                      className="w-full bg-white/10 hover:bg-white/20 border-white/30 text-white text-xs"
                      data-testid="button-toggle-keypad"
                    >
                      
                      {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                    

                    {showKeypad && (
                      
                        Dial Extensions
                        
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                             handleSendDTMF(digit)}
                              className="bg-white/20 hover:bg-white/30 border-white/30 text-white text-base font-bold"
                              data-testid={`button-dtmf-${digit}`}
                            >
                              {digit}
                            
                          ))}
                        
                      
                    )}
                  
                )}
              

              {/* Desktop Layout - Original */}
              
                {/* Profile Picture - Enhanced */}
                
                  
                    
                  
                  
                

                {/* Contact Information - Organized Layout */}
                
                  {/* Contact Name */}
                  
                    {displayContactName}
                  

                  {/* Contact Details Grid */}
                  
                    {/* Job Title & Company */}
                    
                      
                      
                        {displayJobTitle}
                      
                    

                    
                      
                      
                        {displayCompanyName}
                      
                    

                    {/* Email & Phone */}
                    
                      
                      
                        {displayEmail}
                      
                    

                    
                      
                       {
                        setSelectedPhoneType(value);
                        setShowManualDial(value === 'manual');
                      }}>
                        
                          
                        
                        
                          {validPhoneOptions.map((option) => (
                            
                              {option.label}
                            
                          ))}
                          
                            Manual Dial
                          
                        
                      
                      {validPhoneOptions.length === 0 && !showManualDial && (
                        No direct phone — use Manual Dial
                      )}
                    

                    {/* Manual Phone Input */}
                    {showManualDial && (
                      
                        
                         setManualPhoneNumber(e.target.value)}
                          data-testid="input-manual-phone"
                        />
                      
                    )}
                  
                

                {/* Audio Controls - Integrated */}
                
                  
                    {isCurrentlyMuted ? (
                      <>
                        
                        Unmute
                      
                    ) : (
                      <>
                        
                        Mute
                      
                    )}
                  
                

                {/* Call Button - Premium Design */}
                
                  
                    {!isCallActive && callStatus !== 'wrap-up' && (
                      
                        
                        Call
                      
                    )}

                    {isCallActive && (
                      
                        
                        Hang Up
                      
                    )}

                    {callStatus === 'wrap-up' && (
                      
                        Complete disposition below
                      
                    )}
                  

                  {/* DTMF Keypad Toggle & Keypad - Shows during active call */}
                  {callStatus === 'active' && (
                    
                       setShowKeypad(!showKeypad)}
                        className="bg-white/10 hover:bg-white/20 border-white/30 text-white text-xs"
                        data-testid="button-toggle-keypad-desktop"
                      >
                        
                        {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                      

                      {showKeypad && (
                        
                          Dial Extensions
                          
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                             handleSendDTMF(digit)}
                              className="bg-white/20 hover:bg-white/30 border-white/30 text-white text-base font-bold"
                              data-testid={`button-dtmf-${digit}`}
                            >
                                {digit}
                              
                            ))}
                          
                        
                      )}
                    
                  )}
                
              
            
          ) : (
            
              
                
                No contact selected
              
            
          )}

          {/* BOTTOM SPLIT: Script | Dispositions - Premium Design */}
          
            {/* LEFT: SCRIPT PANEL - Clean & Readable */}
            
              
                {/* Campaign Context Section */}
                {(campaignDetails?.campaignObjective || campaignDetails?.campaignContextBrief || (campaignDetails?.talkingPoints && campaignDetails.talkingPoints.length > 0)) && (
                  
                    
                      
                        
                          
                        
                        
                          Campaign Context
                          Background & key messaging points
                        
                      
                    
                    
                      {/* Objective */}
                      {campaignDetails?.campaignObjective && (
                        
                          
                            Objective
                          
                          {campaignDetails.campaignObjective}
                        
                      )}

                      {/* Context Brief */}
                      {campaignDetails?.campaignContextBrief && (
                        
                          
                            Brief
                          
                          {campaignDetails.campaignContextBrief}
                        
                      )}

                      {/* Talking Points */}
                      {campaignDetails?.talkingPoints && campaignDetails.talkingPoints.length > 0 && (
                        
                          
                            Talking Points
                          
                          
                            {campaignDetails.talkingPoints.map((point, idx) => (
                              
                                
                                {point}
                              
                            ))}
                          
                        
                      )}
                    
                  
                )}

                {/* Call Script Section */}
                
                  
                    
                    Call Script
                  
                
                
                  {(assignedScript?.content || campaignDetails?.callScript) ? (
                    renderFormattedScript(assignedScript?.content || campaignDetails?.callScript || '')
                  ) : (
                    
                      
                        "Hello, this is [Your Name] calling from PipelineIQ. May I speak with{' '}
                        
                          {currentQueueItem?.contactName || '[Contact Name]'}
                        ?"
                      
                      
                        "I'm calling to discuss how our B2B solutions can help{' '}
                        
                          {currentQueueItem?.accountName || '[Company Name]'}
                        {' '}
                        streamline their customer engagement..."
                      
                      
                        "We specialize in Account-Based Marketing. Do you have a few minutes to discuss your marketing challenges?"
                      
                    
                  )}
                
              
            

            {/* RIGHT: DISPOSITIONS PANEL - Premium Cards */}
            
              
                {/* Related Contacts from Same Company */}
                {relatedContacts.length > 0 && (
                  
                  
                      
                        
                          
                        
                        Other Contacts at {currentQueueItem?.accountName}
                      
                      
                        {relatedContacts.length} other {relatedContacts.length === 1 ? 'contact' : 'contacts'} in your queue
                      
                    
                    
                      
                        {relatedContacts.map((contact) => (
                          
                            
                              
                                
                                  
                                    {contact.fullName}
                                  
                                  
                                    {contact.queueState === 'in_progress' ? 'Active' : 'Queued'}
                                  
                                
                                {contact.jobTitle && (
                                  
                                    {contact.jobTitle}
                                  
                                )}
                                
                                  {contact.email && (
                                    
                                      
                                      {contact.email}
                                    
                                  )}
                                  {(contact.directPhone || contact.mobilePhone) && (
                                    
                                      
                                      {contact.directPhone || contact.mobilePhone}
                                    
                                  )}
                                
                              
                            
                          
                        ))}
                      
                    
                  
                )}

                {/* Call Notes - Enhanced */}
                
                  
                    
                      
                        
                      
                      Call Notes
                    
                  
                  
                     setNotes(e.target.value)}
                      data-testid="input-call-notes"
                    />
                  
                

                {/* Disposition - Premium Design */}
                
                  
                    
                      
                        
                      
                      Disposition {callStatus === 'wrap-up' && *}
                    
                  
                  
                    
                      Outcome {callStatus === 'wrap-up' && '*'}
                       {
                        setDisposition(value);
                        if (dispositionSubmitState === 'error') {
                          setDispositionSubmitState('idle');
                          setDispositionSubmitMessage('');
                        }
                      }}>
                        
                          
                        
                        
                          ✅ Qualified
                          📞 Call Back
                          ❌ Not Interested
                          📧 Voicemail
                          🚫 Do Not Call
                          ⚠️ Invalid Data
                        
                      
                    

                    {/* Qualification Questions */}
                    {campaignDetails?.qualificationQuestions && campaignDetails.qualificationQuestions.length > 0 && (
                      
                        Qualification
                        
                          {campaignDetails.qualificationQuestions.map((question) => (
                            
                              
                                {question.label}
                                {question.required && *}
                              
                              {question.type === 'select' && question.options ? (
                                 setQualificationData({...qualificationData, [question.id]: value})}
                                >
                                  
                                    
                                  
                                  
                                    {question.options.map((option) => (
                                      
                                        {option.label}
                                      
                                    ))}
                                  
                                
                              ) : question.type === 'text' ? (
                                 setQualificationData({...qualificationData, [question.id]: e.target.value})}
                                  placeholder={`Enter ${question.label.toLowerCase()}...`}
                                  className="min-h-[50px] resize-none text-xs"
                                  data-testid={`input-qual-${question.id}`}
                                />
                              ) : (
                                 setQualificationData({...qualificationData, [question.id]: e.target.value})}
                                  placeholder={`Enter ${question.label.toLowerCase()}...`}
                                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  data-testid={`input-qual-${question.id}`}
                                />
                              )}
                            
                          ))}
                        
                      
                    )}

                    {/* Save Button - Premium Design */}
                    {(callStatus === 'wrap-up' || disposition) && (
                      
                        {saveDispositionMutation.isPending ? (
                          <>
                            
                            Saving...
                          
                        ) : (
                          <>
                            Save & Next
                            
                          
                        )}
                      
                    )}

                    {dispositionSubmitState !== 'idle' && dispositionSubmitMessage && (
                      
                        {dispositionSubmitMessage}
                      
                    )}

                    {activeCallDuration > 0 && (
                      
                        Call duration: {Math.floor(activeCallDuration / 60)}:{(activeCallDuration % 60).toString().padStart(2, '0')}
                      
                    )}
                  
                
              
            
          
        
      

      {/* Contact Mismatch Dialog (Wrong Person Answered) */}
      {activeCallAttemptId && currentQueueItem && (
        
      )}

      {/* Lead Verification Modal */}
      {showVerificationModal && verificationLeadId && currentQueueItem && user?.id && (
         {
            // Just close the modal - do NOT save disposition if user cancels
            setShowVerificationModal(false);
          }}
          onVerificationComplete={() => {
            const dispositionForSubmit = normalizeDispositionForSubmit(disposition);
            // Only save disposition AFTER successful verification
            saveDispositionMutation.mutate({
              queueItemId: currentQueueItem.id,
              campaignId: currentQueueItem.campaignId,
              contactId: switchedContact?.id || currentQueueItem.contactId,
              disposition: dispositionForSubmit,
              duration: activeCallDuration,
              notes,
              qualificationData: Object.keys(qualificationData).length > 0 ? qualificationData : null,
              callbackRequested: dispositionForSubmit === 'callback-requested',
              callControlId: callControlId,
              dialedNumber: dialedPhoneNumber,
              callAttemptId: activeCallAttemptId,
              originalContactId: switchedContact ? currentQueueItem.contactId : null,
              actualContactId: switchedContact?.id || null,
              wrongPersonAnswered: !!switchedContact,
            });
          }}
          leadId={verificationLeadId}
          contactName={displayContactName}
          companyName={displayCompanyName || ''}
          jobTitle={displayJobTitle}
          agentId={user.id}
          campaignId={currentQueueItem.campaignId}
          contactId={switchedContact?.id || currentQueueItem.contactId}
        />
      )}

      {/* Transfer Call Dialog */}
      
        
          
            
              
              Transfer Call
            
          
          
            
              Transfer to phone number
               setTransferNumber(e.target.value)}
                className="font-mono"
              />
              
                Enter the phone number to transfer this call to. Use E.164 format for best results.
              
            
          
          
             setShowTransferDialog(false)}>
              Cancel
            
            
              
              Transfer Now
            
          
        
      

      {/* Audio Device Settings Dialog */}
       {
          console.log('[AUDIO SETTINGS] Network mode changed:', mode);
          setRestrictiveNetworkMode(mode);
        }}
        onDevicesSelected={(micId, speakerId) => {
          console.log('[AUDIO SETTINGS] Devices selected:', { micId, speakerId });
          // Apply to the active WebRTC session and persist via the component
          setAudioDevices?.(micId, speakerId);
        }}
      />
    
  );
}