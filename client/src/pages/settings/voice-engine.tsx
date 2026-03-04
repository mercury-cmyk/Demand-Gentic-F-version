import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceEngineConfig {
  activeEngine: 'texml' | 'sip';
  sip: {
    ready: boolean;
    hasDrachtioHost: boolean;
    hasPublicIp: boolean;
    sipEnabled: boolean;
  };
  texml: {
    ready: boolean;
    hasApiKey: boolean;
    hasAppId: boolean;
  };
}

interface PoolNumber {
  id: string;
  phoneNumberE164: string;
  telnyxConnectionId: string | null;
  telnyxNumberId: string | null;
  status: string;
  region: string | null;
  areaCode: string | null;
}

interface NumbersResponse {
  sipConnectionId: string | null;
  texmlConnectionId: string | null;
  sip: PoolNumber[];
  texml: PoolNumber[];
  unassigned: PoolNumber[];
  totals: { sip: number; texml: number; unassigned: number };
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );
}

function NumberList({
  numbers,
  selected,
  onToggle,
  emptyText,
}: {
  numbers: PoolNumber[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  if (numbers.length === 0) {
    return <p className="text-sm text-muted-foreground italic py-2">{emptyText}</p>;
  }
  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {numbers.map((n) => (
        <label
          key={n.id}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-muted/50 transition-colors',
            selected.has(n.id) && 'bg-muted'
          )}
        >
          <Checkbox
            checked={selected.has(n.id)}
            onCheckedChange={() => onToggle(n.id)}
          />
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{n.phoneNumberE164}</span>
          {n.areaCode && (
            <span className="text-xs text-muted-foreground">({n.areaCode})</span>
          )}
        </label>
      ))}
    </div>
  );
}

export default function VoiceEngineControlCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingEngine, setPendingEngine] = useState<'texml' | 'sip' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTexml, setSelectedTexml] = useState<Set<string>>(new Set());
  const [selectedSip, setSelectedSip] = useState<Set<string>>(new Set());

  const { data: config, isLoading } = useQuery<VoiceEngineConfig>({
    queryKey: ['/api/voice-engine/config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-engine/config');
      return res.json();
    },
  });

  const { data: numbersData, isLoading: numbersLoading } = useQuery<NumbersResponse>({
    queryKey: ['/api/voice-engine/numbers'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-engine/numbers');
      return res.json();
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (engine: 'texml' | 'sip') => {
      const res = await apiRequest('PUT', '/api/voice-engine/config', { engine });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to switch engine');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-engine/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/voice-engine/numbers'] });
      toast({
        title: 'Voice engine updated',
        description: `Switched to ${data.activeEngine === 'sip' ? 'Direct SIP (Drachtio)' : 'Telnyx TeXML'}. New calls will use this engine.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to switch engine', description: error.message, variant: 'destructive' });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ numberIds, targetConnection }: { numberIds: string[]; targetConnection: 'sip' | 'texml' }) => {
      const res = await apiRequest('POST', '/api/voice-engine/numbers/move', { numberIds, targetConnection });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to move numbers');
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-engine/numbers'] });
      setSelectedTexml(new Set());
      setSelectedSip(new Set());
      toast({
        title: `Moved ${data.moved} number${data.moved !== 1 ? 's' : ''}`,
        description: `${data.moved} number${data.moved !== 1 ? 's' : ''} moved to ${variables.targetConnection === 'sip' ? 'SIP' : 'TeXML'} connection.${data.failed > 0 ? ` ${data.failed} failed.` : ''}`,
        variant: data.failed > 0 ? 'destructive' : 'default',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to move numbers', description: error.message, variant: 'destructive' });
    },
  });

  const activeEngine = config?.activeEngine || 'texml';

  function handleSelect(engine: 'texml' | 'sip') {
    if (engine === activeEngine) return;
    // Prevent switching to SIP when it's not ready
    if (engine === 'sip' && !config?.sip.ready) {
      toast({
        title: 'SIP not available',
        description: 'SIP calling is not enabled. Set USE_SIP_CALLING=true and configure Drachtio before switching.',
        variant: 'destructive',
      });
      return;
    }
    setPendingEngine(engine);
    setConfirmOpen(true);
  }

  function handleConfirm() {
    if (pendingEngine) switchMutation.mutate(pendingEngine);
    setConfirmOpen(false);
    setPendingEngine(null);
  }

  function toggleTexml(id: string) {
    setSelectedTexml(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSip(id: string) {
    setSelectedSip(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function moveToSip() {
    if (selectedTexml.size === 0) return;
    moveMutation.mutate({ numberIds: Array.from(selectedTexml), targetConnection: 'sip' });
  }

  function moveToTexml() {
    if (selectedSip.size === 0) return;
    moveMutation.mutate({ numberIds: Array.from(selectedSip), targetConnection: 'texml' });
  }

  return (
    <SettingsLayout
      title="Voice Engine"
      description="Control which call engine handles AI voice calls and manage phone number pools for each connection."
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
                  <CardDescription>All new AI calls will use this engine and its number pool</CardDescription>
                </div>
                <Badge variant={activeEngine === 'sip' ? 'default' : 'secondary'} className="text-sm px-3 py-1">
                  {activeEngine === 'sip' ? 'Direct SIP' : 'Telnyx TeXML'}
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
                      Production setup. Telnyx streams audio to Gemini Live via WebSocket.
                    </CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      {activeEngine === 'texml' && <Badge variant="outline" className="text-xs">Active</Badge>}
                      <Badge variant="secondary" className="text-xs">{numbersData?.totals.texml ?? '?'} numbers</Badge>
                    </div>
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
                </div>
              </CardContent>
            </Card>

            {/* Direct SIP Card */}
            <Card
              className={cn(
                'transition-all border-2',
                activeEngine === 'sip'
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20 cursor-pointer'
                  : !config?.sip.ready
                    ? 'border-transparent opacity-60 cursor-not-allowed'
                    : 'border-transparent hover:border-muted-foreground/20 cursor-pointer'
              )}
              onClick={() => handleSelect('sip')}
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center',
                    activeEngine === 'sip' ? 'border-green-500' : 'border-muted-foreground/40'
                  )}>
                    {activeEngine === 'sip' && <div className="h-2.5 w-2.5 rounded-full bg-green-500" />}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Direct SIP (Drachtio)</CardTitle>
                    <CardDescription className="mt-1">
                      Direct SIP trunk. Lowest latency, lowest cost. Falls back to TeXML if unavailable.
                    </CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      {activeEngine === 'sip' && <Badge variant="outline" className="text-xs">Active</Badge>}
                      <Badge variant="secondary" className="text-xs">{numbersData?.totals.sip ?? '?'} numbers</Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.sip.sipEnabled || false} />
                    <span className="text-muted-foreground">SIP Calling Enabled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.sip.hasDrachtioHost || false} />
                    <span className="text-muted-foreground">Drachtio Host</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={config?.sip.hasPublicIp || false} />
                    <span className="text-muted-foreground">Public IP</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Number Pool Management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Number Pool Management</CardTitle>
              <CardDescription>
                Move phone numbers between TeXML and SIP connections. Each engine only uses numbers assigned to its connection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {numbersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                  {/* TeXML Numbers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">
                        TeXML Pool
                        <Badge variant="secondary" className="ml-2 text-xs">{numbersData?.totals.texml ?? 0}</Badge>
                      </h4>
                      {selectedTexml.size > 0 && (
                        <span className="text-xs text-muted-foreground">{selectedTexml.size} selected</span>
                      )}
                    </div>
                    <div className="border rounded-md p-2">
                      <NumberList
                        numbers={numbersData?.texml || []}
                        selected={selectedTexml}
                        onToggle={toggleTexml}
                        emptyText="No numbers on TeXML connection"
                      />
                    </div>
                  </div>

                  {/* Move Buttons */}
                  <div className="flex flex-col items-center gap-2 pt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedTexml.size === 0 || moveMutation.isPending}
                      onClick={moveToSip}
                      title="Move selected to SIP"
                    >
                      {moveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={selectedSip.size === 0 || moveMutation.isPending}
                      onClick={moveToTexml}
                      title="Move selected to TeXML"
                    >
                      {moveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* SIP Numbers */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">
                        SIP Pool
                        <Badge variant="secondary" className="ml-2 text-xs">{numbersData?.totals.sip ?? 0}</Badge>
                      </h4>
                      {selectedSip.size > 0 && (
                        <span className="text-xs text-muted-foreground">{selectedSip.size} selected</span>
                      )}
                    </div>
                    <div className="border rounded-md p-2">
                      <NumberList
                        numbers={numbersData?.sip || []}
                        selected={selectedSip}
                        onToggle={toggleSip}
                        emptyText="No numbers on SIP connection"
                      />
                    </div>
                  </div>
                </div>
              )}
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
              <strong>{pendingEngine === 'sip' ? 'Direct SIP (Drachtio)' : 'Telnyx TeXML'}</strong>.
              The number pool will automatically switch to use only{' '}
              <strong>{pendingEngine === 'sip' ? 'SIP' : 'TeXML'}</strong> numbers.
              Existing in-progress calls will not be affected.
              {pendingEngine === 'sip' && ' If SIP is unavailable, calls will automatically fall back to TeXML.'}
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
