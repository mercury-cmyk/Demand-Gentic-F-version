import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle, XCircle, Radio, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceEngineConfig {
  activeEngine: 'texml' | 'livekit';
  livekit: {
    ready: boolean;
    url: string | null;
    sipUri: string | null;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  };
  texml: {
    ready: boolean;
    hasApiKey: boolean;
    hasAppId: boolean;
  };
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );
}

export default function VoiceEngineControlCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingEngine, setPendingEngine] = useState<'texml' | 'livekit' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: config, isLoading } = useQuery<VoiceEngineConfig>({
    queryKey: ['/api/voice-engine/config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-engine/config');
      return res.json();
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (engine: 'texml' | 'livekit') => {
      const res = await apiRequest('PUT', '/api/voice-engine/config', { engine });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to switch engine');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-engine/config'] });
      toast({
        title: 'Voice engine updated',
        description: `Switched to ${data.activeEngine === 'livekit' ? 'LiveKit SIP' : 'Telnyx TeXML'}. New calls will use this engine.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to switch engine',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const activeEngine = config?.activeEngine || 'texml';

  function handleSelect(engine: 'texml' | 'livekit') {
    if (engine === activeEngine) return;
    setPendingEngine(engine);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    if (pendingEngine) {
      switchMutation.mutate(pendingEngine);
    }
    setConfirmOpen(false);
    setPendingEngine(null);
  }

  return (
    <SettingsLayout
      title="Voice Engine"
      description="Control which call engine handles AI voice calls. Switch safely between Telnyx TeXML and LiveKit SIP."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Engine Badge */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Active Engine</CardTitle>
                  <CardDescription>All new AI calls will use this engine</CardDescription>
                </div>
                <Badge variant={activeEngine === 'livekit' ? 'default' : 'secondary'} className="text-sm px-3 py-1">
                  {activeEngine === 'livekit' ? 'LiveKit SIP' : 'Telnyx TeXML'}
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Engine Selection */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Telnyx TeXML Card */}
            <Card
              className={cn(
                'cursor-pointer transition-all border-2',
                activeEngine === 'texml'
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-transparent hover:border-muted-foreground/20'
              )}
              onClick={() => handleSelect('texml')}
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center',
                    activeEngine === 'texml' ? 'border-blue-500' : 'border-muted-foreground/40'
                  )}>
                    {activeEngine === 'texml' && <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Telnyx TeXML</CardTitle>
                    <CardDescription className="mt-1">
                      Current production setup. Telnyx handles media streaming directly to Gemini Live via WebSocket.
                    </CardDescription>
                    {activeEngine === 'texml' && (
                      <Badge variant="outline" className="mt-2 text-xs">Active</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.texml.hasApiKey || false} />
                    <span className="text-muted-foreground">Telnyx API Key</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.texml.hasAppId || false} />
                    <span className="text-muted-foreground">TeXML App / Connection ID</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={config?.texml.ready ? 'default' : 'destructive'} className="text-xs">
                      {config?.texml.ready ? 'Ready' : 'Not Configured'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* LiveKit SIP Card */}
            <Card
              className={cn(
                'cursor-pointer transition-all border-2',
                activeEngine === 'livekit'
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-transparent hover:border-muted-foreground/20'
              )}
              onClick={() => handleSelect('livekit')}
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center',
                    activeEngine === 'livekit' ? 'border-green-500' : 'border-muted-foreground/40'
                  )}>
                    {activeEngine === 'livekit' && <div className="h-2.5 w-2.5 rounded-full bg-green-500" />}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">LiveKit SIP</CardTitle>
                    <CardDescription className="mt-1">
                      Real-time SIP bridge with sub-second latency. LiveKit handles VAD, echo cancellation, and transcoding.
                    </CardDescription>
                    {activeEngine === 'livekit' && (
                      <Badge variant="outline" className="mt-2 text-xs">Active</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.livekit.hasApiKey || false} />
                    <span className="text-muted-foreground">LiveKit API Key</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.livekit.hasApiSecret || false} />
                    <span className="text-muted-foreground">LiveKit API Secret</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={!!config?.livekit.url} />
                    <span className="text-muted-foreground">LiveKit URL</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={!!config?.livekit.sipUri} />
                    <span className="text-muted-foreground">SIP URI</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={config?.livekit.ready ? 'default' : 'destructive'} className="text-xs">
                      {config?.livekit.ready ? 'Ready' : 'Not Configured'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground mb-1">Telnyx TeXML</p>
                  <p>Telnyx initiates the call and streams RTP audio bidirectionally to Gemini Live via WebSocket. Proven, production-grade path.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">LiveKit SIP</p>
                  <p>Telnyx dials the prospect, then bridges to a LiveKit room via SIP. The LiveKit agent (Gemini) joins the room for real-time conversation.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Voice Engine?</AlertDialogTitle>
            <AlertDialogDescription>
              This will route all new AI calls through{' '}
              <strong>{pendingEngine === 'livekit' ? 'LiveKit SIP' : 'Telnyx TeXML'}</strong>.
              Existing in-progress calls will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={switchMutation.isPending}>
              {switchMutation.isPending ? 'Switching...' : 'Switch Engine'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  );
}
