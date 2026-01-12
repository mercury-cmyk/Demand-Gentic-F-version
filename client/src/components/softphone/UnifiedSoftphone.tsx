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
  openaiVoice = 'alloy',
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
  const [audioDevices, setAudioDevices] = useState<{
    audioInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
  }>({ audioInputs: [], audioOutputs: [] });
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');

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
    <Card className={compact ? 'w-full max-w-xs' : 'w-full max-w-md'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {compact ? 'Phone' : 'Unified Softphone'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant(state.callState)}>
              {getStatusLabel(state.callState)}
            </Badge>
            {showModeToggle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant={state.bridgeMode === 'ai' ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => state.isCallActive && actions.toggleMode()}
                    >
                      {state.bridgeMode === 'ai' ? (
                        <><Bot className="h-3 w-3 mr-1" /> AI</>
                      ) : (
                        <><User className="h-3 w-3 mr-1" /> Human</>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {state.isCallActive 
                      ? `Click to switch to ${state.bridgeMode === 'ai' ? 'Human' : 'AI'} mode`
                      : 'Mode switching available during call'
                    }
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Call duration */}
        {state.isCallActive && (
          <div className="flex items-center justify-center text-2xl font-mono">
            <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
            {formatDuration(state.callDurationSeconds)}
          </div>
        )}

        {/* Phone number input */}
        {!state.isCallActive && (
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDial()}
              disabled={false}
              className={!state.isReady ? "border-yellow-500 focus:border-yellow-600" : ""}
            />
            {!state.isReady && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  {state.error ? (
                    <>
                      <span className="text-red-500">Connection failed:</span> {state.error.message}
                      {state.error.message.includes('timeout') && (
                        <>
                          <br />
                          <span className="text-xs mt-1">
                            Common causes: Network firewall blocking WebRTC, VPN interference, or Telnyx service issues.
                          </span>
                        </>
                      )}
                      {state.error.message.includes('credentials') && (
                        <>
                          <br />
                          <span className="text-xs mt-1">
                            Check SIP trunk configuration in Settings → Telephony.
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    'Connecting to WebRTC... (This may take 10-30 seconds)'
                  )}
                </p>
                {state.error && (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => actions.connect()}
                      className="self-start"
                    >
                      Retry Connection
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => window.open('https://portal.telnyx.com/#/app/connections', '_blank')}
                      className="self-start text-blue-600"
                    >
                      Check Telnyx Portal
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Incoming call alert */}
        {state.callState === 'ringing' && (
          <div className="flex items-center justify-center gap-2 p-4 bg-green-100 dark:bg-green-900 rounded-lg animate-pulse">
            <PhoneIncoming className="h-6 w-6 text-green-600" />
            <span className="font-medium">Incoming Call</span>
          </div>
        )}

        {/* Main call controls */}
        <div className="flex justify-center gap-2">
          {!state.isCallActive ? (
            <>
              {state.callState === 'ringing' ? (
                <Button
                  size="lg"
                  className="rounded-full h-14 w-14 bg-green-500 hover:bg-green-600"
                  onClick={handleAnswer}
                >
                  <Phone className="h-6 w-6" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className={`rounded-full h-14 w-14 ${
                    state.isReady 
                      ? "bg-green-500 hover:bg-green-600" 
                      : "bg-yellow-500 hover:bg-yellow-600"
                  }`}
                  onClick={handleDial}
                  disabled={!phoneNumber.trim()}
                  title={!state.isReady ? "WebRTC not ready - call may fail" : "Make call"}
                >
                  <Phone className="h-6 w-6" />
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Mute button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={state.isMuted ? 'destructive' : 'outline'}
                      size="lg"
                      className="rounded-full h-12 w-12"
                      onClick={actions.toggleMute}
                    >
                      {state.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{state.isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Hold button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={state.isHeld ? 'secondary' : 'outline'}
                      size="lg"
                      className="rounded-full h-12 w-12"
                      onClick={actions.toggleHold}
                    >
                      {state.isHeld ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{state.isHeld ? 'Resume' : 'Hold'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Hang up button */}
              <Button
                size="lg"
                variant="destructive"
                className="rounded-full h-14 w-14"
                onClick={actions.hangup}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>

              {/* Keypad toggle */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showKeypad ? 'secondary' : 'outline'}
                      size="lg"
                      className="rounded-full h-12 w-12"
                      onClick={() => setShowKeypad(!showKeypad)}
                    >
                      <Keyboard className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Keypad</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          {/* Settings button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showSettings ? 'secondary' : 'ghost'}
                  size="lg"
                  className="rounded-full h-12 w-12"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* DTMF Keypad */}
        {showKeypad && state.isCallActive && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {dtmfKeys.flat().map((digit) => (
              <Button
                key={digit}
                variant="outline"
                className="h-12 text-lg font-medium"
                onClick={() => handleDTMF(digit)}
              >
                {digit}
              </Button>
            ))}
          </div>
        )}

        {/* Mode toggle (when in call) */}
        {showModeToggle && state.isCallActive && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="text-sm">Human</span>
              </div>
              <Switch
                checked={state.bridgeMode === 'ai'}
                onCheckedChange={() => actions.toggleMode()}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm">AI</span>
                <Bot className="h-4 w-4" />
              </div>
            </div>

            {/* AI monitoring toggle */}
            {state.bridgeMode === 'ai' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monitor AI Audio</span>
                <Button
                  variant={state.isMonitoring ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={actions.toggleMonitoring}
                >
                  {state.isMonitoring ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Transcripts panel (AI mode) */}
        {showTranscripts && state.bridgeMode === 'ai' && state.transcripts.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4" />
                Live Transcript
              </div>
              <ScrollArea className="h-32 rounded border p-2">
                {state.transcripts.map((t, i) => (
                  <div
                    key={i}
                    className={`text-sm mb-1 ${
                      t.role === 'assistant' 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="font-medium">{t.role === 'assistant' ? 'AI: ' : 'User: '}</span>
                    {t.text}
                  </div>
                ))}
              </ScrollArea>
            </div>
          </>
        )}

        {/* Audio device settings */}
        {showSettings && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm">Microphone</Label>
                <Select value={selectedMic} onValueChange={handleMicChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.audioInputs.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Speaker</Label>
                <Select value={selectedSpeaker} onValueChange={handleSpeakerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select speaker" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices.audioOutputs.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {/* Error display */}
        {state.error && (
          <div className="p-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded text-sm">
            {state.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default UnifiedSoftphone;
