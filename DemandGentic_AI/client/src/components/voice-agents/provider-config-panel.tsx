/**
 * Voice Provider Configuration Panel
 *
 * Configures primary and fallback voice providers for virtual agents.
 * Features:
 * - Dynamic voice list fetched from API (auto-synced)
 * - Voice preview (play sample) button
 * - Provider health status monitoring
 */

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Settings2,
  Volume2,
  Zap,
  RefreshCw,
  Play,
  Square,
  Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// ==================== TYPES ====================

interface VoiceInfo {
  id: string;
  name: string;
  displayName: string;
  gender: 'male' | 'female' | 'neutral';
  language: string;
  provider: 'openai' | 'gemini';
  description?: string;
}

interface VoicesByProvider {
  openai: VoiceInfo[];
  gemini: VoiceInfo[];
}

interface ProviderHealthResponse {
  status: 'healthy' | 'degraded' | 'error';
  providers: {
    openai: { status: 'online' | 'offline' };
    gemini: { status: 'online' | 'offline' };
  };
  cache: {
    voiceCount: number;
    isCached: boolean;
  };
  timestamp: string;
}

export interface ProviderConfig {
  primaryProvider: string;
  primaryVoice: string;
  fallbackProvider: string;
  fallbackVoice: string;
  autoFallback: boolean;
}

export interface ProviderConfigPanelProps {
  config: ProviderConfig;
  onChange: (config: ProviderConfig) => void;
  disabled?: boolean;
}

// ==================== CONSTANTS ====================

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI Realtime', description: 'GPT-4 based voice' },
  { id: 'gemini', name: 'Google Gemini', description: 'Live voice' },
];

// ==================== COMPONENT ====================

export function ProviderConfigPanel({ config, onChange, disabled }: ProviderConfigPanelProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playingVoice, setPlayingVoice] = useState(null);
  const audioRef = useRef(null);

  // Fetch available voices from API
  const {
    data: voices,
    isLoading: voicesLoading,
    refetch: refetchVoices,
  } = useQuery({
    queryKey: ['/api/voice-providers/voices'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-providers/voices');
      return res.json();
    },
    enabled: !!token,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Fetch provider health status
  const {
    data: healthData,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ['/api/voice-providers/health'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-providers/health');
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
  });

  // Get voices for a specific provider
  const getVoicesForProvider = (providerId: string): VoiceInfo[] => {
    if (!voices) return [];
    switch (providerId) {
      case 'openai':
        return voices.openai || [];
      case 'gemini':
        return voices.gemini || [];
      default:
        return [];
    }
  };

  // Get provider health status
  const getProviderStatus = (providerId: string): 'online' | 'offline' | undefined => {
    if (!healthData?.providers) return undefined;
    const provider = healthData.providers[providerId as keyof typeof healthData.providers];
    return provider?.status;
  };

  // Handle refresh button click
  const handleRefreshHealth = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchHealth(), refetchVoices()]);
      toast({
        title: 'Refreshed',
        description: 'Voice providers and status updated',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to refresh voice providers',
      });
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Play voice preview
  const playVoicePreview = async (voiceId: string, provider: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // If clicking the same voice that's playing, just stop
    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setPlayingVoice(voiceId);

    try {
      const res = await apiRequest('POST', '/api/voice-providers/preview', {
        voiceId,
        provider,
      });

      if (!res.ok) {
        throw new Error('Failed to generate preview');
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to play voice preview',
        });
      };

      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      setPlayingVoice(null);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate voice preview',
      });
    }
  };

  // Status badge component
  const StatusBadge = ({ status }: { status?: 'online' | 'offline' }) => {
    if (!status) return Unknown;

    const config = {
      online: {
        variant: 'default' as const,
        className: 'bg-green-500',
        icon: CheckCircle2,
      },
      offline: {
        variant: 'destructive' as const,
        className: '',
        icon: AlertCircle,
      },
    };

    const { variant, className, icon: Icon } = config[status];
    return (
      
        
        {status}
      
    );
  };

  // Voice select item with preview button
  const VoiceSelectItem = ({
    voice,
    provider,
  }: {
    voice: VoiceInfo;
    provider: string;
  }) => {
    const isPlaying = playingVoice === voice.id;

    return (
      
        
          
          {voice.displayName || voice.name}
          
            {voice.gender}
          
        
         {
            e.preventDefault();
            e.stopPropagation();
            playVoicePreview(voice.id, provider);
          }}
        >
          {isPlaying ? (
            
          ) : (
            
          )}
        
      
    );
  };

  return (
    
      
        
          
            
              
              Voice Provider Configuration
            
            
              Configure primary and fallback voice providers
              {voices && (
                
                  ({voices.openai?.length || 0} OpenAI, {voices.gemini?.length || 0} Gemini voices)
                
              )}
            
          
          
            
            Refresh
          
        
      
      
        {/* Provider Health Overview */}
        
          {PROVIDERS.map(provider => {
            const status = getProviderStatus(provider.id);
            return (
              
                
                  {provider.name}
                  
                
                {provider.description}
              
            );
          })}
        

        {/* Loading state */}
        {voicesLoading && (
          
            
            
          
        )}

        {/* Primary Provider */}
        {!voicesLoading && (
          
            
              
              Primary Provider
            

            
              
                Provider
                
                    onChange({
                      ...config,
                      primaryProvider: value,
                      primaryVoice: getVoicesForProvider(value)[0]?.id || '',
                    })
                  }
                  disabled={disabled}
                >
                  
                    
                  
                  
                    {PROVIDERS.map(provider => (
                      
                        
                          {provider.name}
                          
                        
                      
                    ))}
                  
                
              

              
                Voice (click play to preview)
                 onChange({ ...config, primaryVoice: value })}
                  disabled={disabled || !config.primaryProvider}
                >
                  
                    
                  
                  
                    {getVoicesForProvider(config.primaryProvider).map(voice => (
                      
                        
                      
                    ))}
                  
                
              
            

            {/* Show selected voice description */}
            {config.primaryVoice && (
              
                {getVoicesForProvider(config.primaryProvider).find(v => v.id === config.primaryVoice)?.description}
              
            )}
          
        )}

        {/* Fallback Provider */}
        {!voicesLoading && (
          
            
              
                
                Fallback Provider
              
              
                
                  Auto-fallback
                
                 onChange({ ...config, autoFallback: checked })}
                  disabled={disabled}
                />
              
            

            
              
                Provider
                
                    onChange({
                      ...config,
                      fallbackProvider: value,
                      fallbackVoice: getVoicesForProvider(value)[0]?.id || '',
                    })
                  }
                  disabled={disabled}
                >
                  
                    
                  
                  
                    {PROVIDERS.filter(p => p.id !== config.primaryProvider).map(provider => (
                      
                        
                          {provider.name}
                          
                        
                      
                    ))}
                  
                
              

              
                Voice (click play to preview)
                 onChange({ ...config, fallbackVoice: value })}
                  disabled={disabled || !config.fallbackProvider}
                >
                  
                    
                  
                  
                    {getVoicesForProvider(config.fallbackProvider).map(voice => (
                      
                        
                      
                    ))}
                  
                
              
            

            {/* Show selected voice description */}
            {config.fallbackVoice && (
              
                {getVoicesForProvider(config.fallbackProvider).find(v => v.id === config.fallbackVoice)?.description}
              
            )}

            {config.autoFallback && (
              
                When enabled, the system will automatically switch to the fallback provider if the
                primary provider fails or experiences high latency.
              
            )}
          
        )}
      
    
  );
}