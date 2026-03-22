/**
 * Unified Softphone Component
 * 
 * Shared calling interface for both Human and AI agents.
 * Uses Telnyx WebRTC + OpenAI Realtime WebRTC.
 * No WebSockets - pure WebRTC for all media.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Bot,
  User,
  Settings,
  Keyboard,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { useUnifiedWebRTC, type TelnyxCallState, type BridgeMode } from '@/hooks/useUnifiedWebRTC';
import type { TelnyxCredentials } from '@/lib/webrtc';

interface UnifiedSoftphoneProps {
  // Required credentials
  telnyxCredentials: TelnyxCredentials;
  // Caller ID
  callerIdName?: string;
  callerIdNumber?: string;
  // Server endpoint for OpenAI ephemeral tokens
  openaiEphemeralEndpoint: string;
  // AI configuration
  openaiModel?: string;
  openaiVoice?: string;
  openaiInstructions?: string;
  // Initial mode
  initialMode?: BridgeMode;
  // Whether to show AI mode toggle
  showModeToggle?: boolean;
  // Whether to show transcript panel
  showTranscripts?: boolean;
  // Compact mode
  compact?: boolean;
  // Callbacks
  onCallStart?: (destination: string) => void;
  onCallEnd?: () => void;
  onModeChange?: (mode: BridgeMode) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
}

// Format seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get status badge variant
function getStatusVariant(state: TelnyxCallState): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'active': return 'default';
    case 'ringing': return 'secondary';
    case 'connecting': return 'secondary';
    case 'error': return 'destructive';
    default: return 'outline';
  }
}

// Get status label
function getStatusLabel(state: TelnyxCallState): string {
  switch (state) {
    case 'idle': return 'Ready';
    case 'connecting': return 'Connecting...';
    case 'ringing': return 'Ringing...';
    case 'early': return 'Early Media';
    case 'active': return 'In Call';
    case 'held': return 'On Hold';
    case 'hangup': return 'Ended';
    case 'error': return 'Error';
    default: return state;
  }
}

export function UnifiedSoftphone({
  telnyxCredentials,
  callerIdName,
  callerIdNumber,
  openaiEphemeralEndpoint,
  openaiModel,
  openaiVoice = 'marin',
  openaiInstructions,
  initialMode = 'human',
  showModeToggle = true,
  showTranscripts = true,
  compact = false,
  onCallStart,
  onCallEnd,
  onModeChange,
  onTranscript,
}: UnifiedSoftphoneProps) {
  // Hook for unified WebRTC
  const [state, actions] = useUnifiedWebRTC({
    telnyxCredentials,
    callerIdName,
    callerIdNumber,
    openaiEphemeralEndpoint,
    openaiModel,
    openaiVoice,
    openaiInstructions,
    enableAIMonitoring: true,
  });

  // Local state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [audioDevices, setAudioDevices] = useState({ audioInputs: [], audioOutputs: [] });
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  // Connect on mount
  useEffect(() => {
    actions.connect().catch(console.error);
  }, []);

  // Load audio devices
  useEffect(() => {
    if (state.isReady) {
      actions.getDevices().then(setAudioDevices);
    }
  }, [state.isReady]);

  // Handle mode change callback
  useEffect(() => {
    onModeChange?.(state.bridgeMode);
  }, [state.bridgeMode]);

  // Handle call end callback
  useEffect(() => {
    if (state.callState === 'hangup') {
      onCallEnd?.();
    }
  }, [state.callState]);

  // Handle transcript callback
  useEffect(() => {
    const latest = state.transcripts[state.transcripts.length - 1];
    if (latest?.isFinal) {
      onTranscript?.(latest.text, latest.role);
    }
  }, [state.transcripts]);

  // Handle dial
  const handleDial = async () => {
    if (!phoneNumber.trim()) return;
    
    try {
      await actions.makeCall(phoneNumber);
      onCallStart?.(phoneNumber);
    } catch (err) {
      console.error('Dial error:', err);
    }
  };

  // Handle answer
  const handleAnswer = async () => {
    try {
      await actions.answerCall();
    } catch (err) {
      console.error('Answer error:', err);
    }
  };

  // Handle DTMF
  const handleDTMF = (digit: string) => {
    actions.sendDTMF(digit);
    if (!state.isCallActive) {
      setPhoneNumber(prev => prev + digit);
    }
  };

  // Handle device change
  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId);
    await actions.setAudioInput(deviceId);
  };

  const handleSpeakerChange = async (deviceId: string) => {
    setSelectedSpeaker(deviceId);
    await actions.setAudioOutput(deviceId);
  };

  // DTMF keypad
  const dtmfKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];

  return (
    
      
        
          
            
            {compact ? 'Phone' : 'Unified Softphone'}
          
          
            
              {getStatusLabel(state.callState)}
            
            {showModeToggle && (
              
                
                  
                     state.isCallActive && actions.toggleMode()}
                    >
                      {state.bridgeMode === 'ai' ? (
                        <> AI
                      ) : (
                        <> Human
                      )}
                    
                  
                  
                    {state.isCallActive 
                      ? `Click to switch to ${state.bridgeMode === 'ai' ? 'Human' : 'AI'} mode`
                      : 'Mode switching available during call'
                    }
                  
                
              
            )}
          
        
      

      
        {/* Call duration */}
        {state.isCallActive && (
          
            
            {formatDuration(state.callDurationSeconds)}
          
        )}

        {/* Phone number input */}
        {!state.isCallActive && (
          
            Phone Number
             setPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDial()}
              disabled={false}
              className={!state.isReady ? "border-yellow-500 focus:border-yellow-600" : ""}
            />
            {!state.isReady && (
              
                
                  {state.error ? (
                    <>
                      Connection failed: {state.error.message}
                      {state.error.message.includes('timeout') && (
                        <>
                          
                          
                            Common causes: Network firewall blocking WebRTC, VPN interference, or Telnyx service issues.
                          
                        
                      )}
                      {state.error.message.includes('credentials') && (
                        <>
                          
                          
                            Check SIP trunk configuration in Settings → Telephony.
                          
                        
                      )}
                    
                  ) : (
                    'Connecting to WebRTC... (This may take 10-30 seconds)'
                  )}
                
                {state.error && (
                  
                     actions.connect()}
                      className="self-start"
                    >
                      Retry Connection
                    
                     window.open('https://portal.telnyx.com/#/app/connections', '_blank')}
                      className="self-start text-blue-600"
                    >
                      Check Telnyx Portal
                    
                  
                )}
              
            )}
          
        )}

        {/* Incoming call alert */}
        {state.callState === 'ringing' && (
          
            
            Incoming Call
          
        )}

        {/* Main call controls */}
        
          {!state.isCallActive ? (
            <>
              {state.callState === 'ringing' ? (
                
                  
                
              ) : (
                
                  
                
              )}
            
          ) : (
            <>
              {/* Mute button */}
              
                
                  
                    
                      {state.isMuted ?  : }
                    
                  
                  {state.isMuted ? 'Unmute' : 'Mute'}
                
              

              {/* Hold button */}
              
                
                  
                    
                      {state.isHeld ?  : }
                    
                  
                  {state.isHeld ? 'Resume' : 'Hold'}
                
              

              {/* Hang up button */}
              
                
              

              {/* Keypad toggle */}
              
                
                  
                     setShowKeypad(!showKeypad)}
                    >
                      
                    
                  
                  Keypad
                
              
            
          )}

          {/* Settings button */}
          
            
              
                 setShowSettings(!showSettings)}
                >
                  
                
              
              Settings
            
          
        

        {/* DTMF Keypad */}
        {showKeypad && state.isCallActive && (
          
            {dtmfKeys.flat().map((digit) => (
               handleDTMF(digit)}
              >
                {digit}
              
            ))}
          
        )}

        {/* Mode toggle (when in call) */}
        {showModeToggle && state.isCallActive && (
          <>
            
            
              
                
                Human
              
               actions.toggleMode()}
              />
              
                AI
                
              
            

            {/* AI monitoring toggle */}
            {state.bridgeMode === 'ai' && (
              
                Monitor AI Audio
                
                  {state.isMonitoring ?  : }
                
              
            )}
          
        )}

        {/* Transcripts panel (AI mode) */}
        {showTranscripts && state.bridgeMode === 'ai' && state.transcripts.length > 0 && (
          <>
            
            
              
                
                Live Transcript
              
              
                {state.transcripts.map((t, i) => (
                  
                    {t.role === 'assistant' ? 'AI: ' : 'User: '}
                    {t.text}
                  
                ))}
              
            
          
        )}

        {/* Audio device settings */}
        {showSettings && (
          <>
            
            
              
                Microphone
                
                  
                    
                  
                  
                    {audioDevices.audioInputs.map((device) => (
                      
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      
                    ))}
                  
                
              

              
                Speaker
                
                  
                    
                  
                  
                    {audioDevices.audioOutputs.map((device) => (
                      
                        {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                      
                    ))}
                  
                
              
            
          
        )}

        {/* Error display */}
        {state.error && (
          
            {state.error.message}
          
        )}
      
    
  );
}

export default UnifiedSoftphone;