/**
 * Voice Provider Configuration Panel
 *
 * Configures primary and fallback voice providers for virtual agents.
 * Shows provider status and allows selection of voice options.
 */

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface ProviderHealth {
  provider: string;
  status: 'online' | 'degraded' | 'offline';
  latency?: number;
  lastChecked: string;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  language: string;
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

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI Realtime', description: 'GPT-4 based voice' },
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini Live voice' },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'High-quality TTS' },
];

const OPENAI_VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral', language: 'en' },
  { id: 'echo', name: 'Echo', gender: 'male', language: 'en' },
  { id: 'fable', name: 'Fable', gender: 'male', language: 'en' },
  { id: 'onyx', name: 'Onyx', gender: 'male', language: 'en' },
  { id: 'nova', name: 'Nova', gender: 'female', language: 'en' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', language: 'en' },
];

const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Aoede', name: 'Aoede', gender: 'female', language: 'en' },
  { id: 'Charon', name: 'Charon', gender: 'male', language: 'en' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', language: 'en' },
  { id: 'Kore', name: 'Kore', gender: 'female', language: 'en' },
  { id: 'Puck', name: 'Puck', gender: 'male', language: 'en' },
];

export function ProviderConfigPanel({ config, onChange, disabled }: ProviderConfigPanelProps) {
  const { token } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch provider health status
  const { data: providerHealth = [], refetch: refetchHealth } = useQuery<ProviderHealth[]>({
    queryKey: ['/api/voice-providers/health'],
    queryFn: async () => {
      // Mock health check - in real implementation, this would call the API
      return [
        { provider: 'openai', status: 'online', latency: 45, lastChecked: new Date().toISOString() },
        { provider: 'gemini', status: 'online', latency: 62, lastChecked: new Date().toISOString() },
        { provider: 'elevenlabs', status: 'online', latency: 78, lastChecked: new Date().toISOString() },
      ];
    },
    enabled: !!token,
    refetchInterval: 30000,
  });

  const getVoicesForProvider = (providerId: string): VoiceOption[] => {
    switch (providerId) {
      case 'openai':
        return OPENAI_VOICES;
      case 'gemini':
        return GEMINI_VOICES;
      default:
        return [];
    }
  };

  const getProviderStatus = (providerId: string): ProviderHealth | undefined => {
    return providerHealth.find(h => h.provider === providerId);
  };

  const handleRefreshHealth = async () => {
    setIsRefreshing(true);
    await refetchHealth();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const StatusBadge = ({ status }: { status?: 'online' | 'degraded' | 'offline' }) => {
    if (!status) return <Badge variant="outline">Unknown</Badge>;

    const config = {
      online: {
        variant: 'default' as const,
        className: 'bg-green-500',
        icon: CheckCircle2,
      },
      degraded: {
        variant: 'outline' as const,
        className: 'border-amber-300 text-amber-700',
        icon: AlertCircle,
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Voice Provider Configuration
            </CardTitle>
            <CardDescription>Configure primary and fallback voice providers</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshHealth}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Health Overview */}
        <div className="grid grid-cols-3 gap-3">
          {PROVIDERS.map(provider => {
            const health = getProviderStatus(provider.id);
            return (
              <div
                key={provider.id}
                className="p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{provider.name}</span>
                  <StatusBadge status={health?.status} />
                </div>
                {health?.latency && (
                  <p className="text-xs text-muted-foreground">{health.latency}ms latency</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Primary Provider */}
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
                        <StatusBadge status={getProviderStatus(provider.id)?.status} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Voice</Label>
              <Select
                value={config.primaryVoice}
                onValueChange={value => onChange({ ...config, primaryVoice: value })}
                disabled={disabled || !config.primaryProvider}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {getVoicesForProvider(config.primaryProvider).map(voice => (
                    <SelectItem key={voice.id} value={voice.id}>
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-3 w-3" />
                        <span>{voice.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {voice.gender}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Fallback Provider */}
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
                        <StatusBadge status={getProviderStatus(provider.id)?.status} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Voice</Label>
              <Select
                value={config.fallbackVoice}
                onValueChange={value => onChange({ ...config, fallbackVoice: value })}
                disabled={disabled || !config.fallbackProvider}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {getVoicesForProvider(config.fallbackProvider).map(voice => (
                    <SelectItem key={voice.id} value={voice.id}>
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-3 w-3" />
                        <span>{voice.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {voice.gender}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.autoFallback && (
            <p className="text-xs text-muted-foreground">
              When enabled, the system will automatically switch to the fallback provider if the
              primary provider fails or experiences high latency.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
