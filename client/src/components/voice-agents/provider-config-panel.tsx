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
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch available voices from API
  const {
    data: voices,
    isLoading: voicesLoading,
    refetch: refetchVoices,
  } = useQuery<VoicesByProvider>({
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
  } = useQuery<ProviderHealthResponse>({
    queryKey: ['/api/voice-providers/health'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-providers/health');
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 30000, // Poll every 30 seconds
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
    if (!status) return <Badge variant="outline">Unknown</Badge>;

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
      <Badge variant={variant} className={className}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
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
      <div className="flex items-center justify-between w-full gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Volume2 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{voice.displayName || voice.name}</span>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            {voice.gender}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            playVoicePreview(voice.id, provider);
          }}
        >
          {isPlaying ? (
            <Square className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Voice Provider Configuration
            </CardTitle>
            <CardDescription>
              Configure primary and fallback voice providers
              {voices && (
                <span className="ml-2 text-xs">
                  ({voices.openai?.length || 0} OpenAI, {voices.gemini?.length || 0} Gemini voices)
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshHealth}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Health Overview */}
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(provider => {
            const status = getProviderStatus(provider.id);
            return (
              <div
                key={provider.id}
                className="p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{provider.name}</span>
                  <StatusBadge status={status} />
                </div>
                <p className="text-xs text-muted-foreground">{provider.description}</p>
              </div>
            );
          })}
        </div>

        {/* Loading state */}
        {voicesLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {/* Primary Provider */}
        {!voicesLoading && (
          <div className="space-y-4 p-4 rounded-lg border bg-primary/5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">Primary Provider</Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={config.primaryProvider}
                  onValueChange={value =>
                    onChange({
                      ...config,
                      primaryProvider: value,
                      primaryVoice: getVoicesForProvider(value)[0]?.id || '',
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        <div className="flex items-center gap-2">
                          <span>{provider.name}</span>
                          <StatusBadge status={getProviderStatus(provider.id)} />
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voice (click play to preview)</Label>
                <Select
                  value={config.primaryVoice}
                  onValueChange={value => onChange({ ...config, primaryVoice: value })}
                  disabled={disabled || !config.primaryProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {getVoicesForProvider(config.primaryProvider).map(voice => (
                      <SelectItem key={voice.id} value={voice.id}>
                        <VoiceSelectItem voice={voice} provider={config.primaryProvider} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show selected voice description */}
            {config.primaryVoice && (
              <p className="text-xs text-muted-foreground">
                {getVoicesForProvider(config.primaryProvider).find(v => v.id === config.primaryVoice)?.description}
              </p>
            )}
          </div>
        )}

        {/* Fallback Provider */}
        {!voicesLoading && (
          <div className="space-y-4 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-semibold">Fallback Provider</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-fallback" className="text-sm text-muted-foreground">
                  Auto-fallback
                </Label>
                <Switch
                  id="auto-fallback"
                  checked={config.autoFallback}
                  onCheckedChange={checked => onChange({ ...config, autoFallback: checked })}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={config.fallbackProvider}
                  onValueChange={value =>
                    onChange({
                      ...config,
                      fallbackProvider: value,
                      fallbackVoice: getVoicesForProvider(value)[0]?.id || '',
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select fallback provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.filter(p => p.id !== config.primaryProvider).map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        <div className="flex items-center gap-2">
                          <span>{provider.name}</span>
                          <StatusBadge status={getProviderStatus(provider.id)} />
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voice (click play to preview)</Label>
                <Select
                  value={config.fallbackVoice}
                  onValueChange={value => onChange({ ...config, fallbackVoice: value })}
                  disabled={disabled || !config.fallbackProvider}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {getVoicesForProvider(config.fallbackProvider).map(voice => (
                      <SelectItem key={voice.id} value={voice.id}>
                        <VoiceSelectItem voice={voice} provider={config.fallbackProvider} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Show selected voice description */}
            {config.fallbackVoice && (
              <p className="text-xs text-muted-foreground">
                {getVoicesForProvider(config.fallbackProvider).find(v => v.id === config.fallbackVoice)?.description}
              </p>
            )}

            {config.autoFallback && (
              <p className="text-xs text-muted-foreground mt-2">
                When enabled, the system will automatically switch to the fallback provider if the
                primary provider fails or experiences high latency.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
