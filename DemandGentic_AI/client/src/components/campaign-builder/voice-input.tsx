/**
 * Voice Input Component
 * 
 * Multi-modal voice input supporting:
 * - Push-to-talk (hold to record)
 * - Toggle recording mode
 * - Real-time transcription display
 * - Waveform visualization
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Mic,
  MicOff,
  Loader2,
  Volume2,
  Square,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
  Radio,
  Keyboard,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface VoiceInputProps {
  onTranscript: (transcript: string, final: boolean) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  mode?: 'toggle' | 'push-to-talk';
  disabled?: boolean;
  className?: string;
  showTranscript?: boolean;
  maxDuration?: number; // seconds
}

interface AudioLevel {
  level: number;
  timestamp: number;
}

// ============================================================
// AUDIO VISUALIZATION COMPONENT
// ============================================================

interface WaveformProps {
  levels: AudioLevel[];
  isRecording: boolean;
}

function Waveform({ levels, isRecording }: WaveformProps) {
  const bars = 20;
  const recentLevels = levels.slice(-bars);
  
  return (
    
      {Array.from({ length: bars }).map((_, i) => {
        const level = recentLevels[i]?.level || 0;
        const height = Math.max(4, Math.min(32, level * 32));
        
        return (
          
        );
      })}
    
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function VoiceInput({
  onTranscript,
  onRecordingChange,
  mode = 'toggle',
  disabled = false,
  className,
  showTranscript = true,
  maxDuration = 120,
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [audioLevels, setAudioLevels] = useState([]);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const durationIntervalRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event: any) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i  prev + (prev ? ' ' : '') + final);
        onTranscript(final, true);
      } else if (interim) {
        onTranscript(interim, false);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted') {
        setError(`Recognition error: ${event.error}`);
      }
      stopRecording();
    };

    recognitionRef.current.onend = () => {
      // Auto-restart if still recording
      if (isRecording && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Ignore - might already be started
        }
      }
    };

    return () => {
      stopRecording();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Audio level monitoring
  const startAudioMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const updateLevels = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalized = average / 255;
        
        setAudioLevels(prev => [
          ...prev.slice(-50),
          { level: normalized, timestamp: Date.now() }
        ]);
        
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };

      updateLevels();
    } catch (err) {
      console.error('Failed to access microphone:', err);
      setError('Microphone access denied');
    }
  }, []);

  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current = null;
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    if (!isSupported || isRecording || disabled) return;
    
    setError(null);
    setInterimTranscript('');
    setDuration(0);
    setAudioLevels([]);
    
    try {
      recognitionRef.current?.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      
      startAudioMonitoring();
      
      // Duration timer
      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording');
    }
  }, [isSupported, isRecording, disabled, startAudioMonitoring, maxDuration, onRecordingChange]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      // Ignore
    }
    
    setIsRecording(false);
    onRecordingChange?.(false);
    
    stopAudioMonitoring();
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, [isRecording, stopAudioMonitoring, onRecordingChange]);

  // Toggle recording
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Push-to-talk handlers
  const handleMouseDown = useCallback(() => {
    if (mode === 'push-to-talk') {
      setIsPushToTalkActive(true);
      startRecording();
    }
  }, [mode, startRecording]);

  const handleMouseUp = useCallback(() => {
    if (mode === 'push-to-talk' && isPushToTalkActive) {
      setIsPushToTalkActive(false);
      stopRecording();
    }
  }, [mode, isPushToTalkActive, stopRecording]);

  // Keyboard handlers for push-to-talk
  useEffect(() => {
    if (mode !== 'push-to-talk') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !disabled) {
        e.preventDefault();
        setIsPushToTalkActive(true);
        startRecording();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPushToTalkActive(false);
        stopRecording();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode, disabled, startRecording, stopRecording]);

  // Clear transcript
  const clearTranscript = () => {
    setFinalTranscript('');
    setInterimTranscript('');
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isSupported) {
    return (
      
        
        Voice input not supported in this browser
      
    );
  }

  return (
    
      {/* Controls */}
      
        {mode === 'toggle' ? (
          
            {isRecording ? (
              <>
                
                Stop Recording
              
            ) : (
              <>
                
                Start Recording
              
            )}
          
        ) : (
          
            
            {isPushToTalkActive ? 'Recording...' : 'Hold to Talk'}
          
        )}

        {/* Duration */}
        {isRecording && (
          
            
              
              {formatDuration(duration)}
            
            
          
        )}

        {/* Mode indicator */}
        
          {mode === 'push-to-talk' ? (
            <>
              
              Space to talk
            
          ) : (
            <>
              
              Click to toggle
            
          )}
        
      

      {/* Waveform */}
      
        {isRecording && (
          
            
          
        )}
      

      {/* Transcript display */}
      {showTranscript && (finalTranscript || interimTranscript) && (
        
          
            Transcript
            
              
              Clear
            
          
          
          
            {finalTranscript}
            {interimTranscript && (
               {interimTranscript}
            )}
          
        
      )}

      {/* Error display */}
      {error && (
        
          
          {error}
        
      )}
    
  );
}

// ============================================================
// COMPACT VERSION
// ============================================================

interface CompactVoiceInputProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CompactVoiceInput({ onTranscript, disabled, className }: CompactVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  if (!isSupported) return null;

  return (
     {
        if (final) onTranscript(text);
      }}
      onRecordingChange={setIsRecording}
      mode="toggle"
      disabled={disabled}
      showTranscript={false}
      className={className}
    />
  );
}

export default VoiceInput;