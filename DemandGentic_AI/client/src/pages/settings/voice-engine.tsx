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

function getSipAvailabilityIssue(config?: VoiceEngineConfig): string | null {
  if (!config) return null;

  const missing: string[] = [];
  if (!config.sip.sipEnabled) missing.push('USE_SIP_CALLING=true');
  if (!config.sip.hasDrachtioHost) missing.push('DRACHTIO_HOST');

  if (missing.length === 0) {
    return null;
  }

  const requirements = missing.join(' and ');
  const productionHint = config.sip.hasPublicIp ? '' : ' PUBLIC_IP is also recommended for production SIP traffic.';

  return `SIP is not ready. Configure ${requirements} before switching.${productionHint}`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    
  ) : (
    
  );
}

function NumberList({
  numbers,
  selected,
  onToggle,
  emptyText,
}: {
  numbers: PoolNumber[];
  selected: Set;
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  if (numbers.length === 0) {
    return {emptyText};
  }
  return (
    
      {numbers.map((n) => (
        
           onToggle(n.id)}
          />
          
          {n.phoneNumberE164}
          {n.areaCode && (
            ({n.areaCode})
          )}
        
      ))}
    
  );
}

export default function VoiceEngineControlCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingEngine, setPendingEngine] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedTexml, setSelectedTexml] = useState>(new Set());
  const [selectedSip, setSelectedSip] = useState>(new Set());

  const { data: config, isLoading } = useQuery({
    queryKey: ['/api/voice-engine/config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/voice-engine/config');
      return res.json();
    },
  });

  const { data: numbersData, isLoading: numbersLoading } = useQuery({
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
  const sipAvailabilityIssue = getSipAvailabilityIssue(config);
  const canSwitchToSip = !sipAvailabilityIssue;

  function handleSelect(engine: 'texml' | 'sip') {
    if (engine === activeEngine) return;
    // Prevent switching to SIP when it's not ready
    if (engine === 'sip' && !canSwitchToSip) {
      toast({
        title: 'SIP not available',
        description: sipAvailabilityIssue || 'SIP is not ready yet. Configure SIP prerequisites before switching.',
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
    
      {isLoading ? (
        
          
        
      ) : (
        
          {/* Active Engine Badge */}
          
            
              
                
                  Active Engine
                  All new AI calls will use this engine and its number pool
                
                
                  {activeEngine === 'sip' ? 'Direct SIP' : 'Telnyx TeXML'}
                
              
            
          

          {/* Engine Selection */}
          
            {/* Telnyx TeXML Card */}
             handleSelect('texml')}
            >
              
                
                  
                    {activeEngine === 'texml' && }
                  
                  
                    Telnyx TeXML
                    
                      Production setup. Telnyx streams audio to Gemini Live via WebSocket.
                    
                    
                      {activeEngine === 'texml' && Active}
                      {numbersData?.totals.texml ?? '?'} numbers
                    
                  
                
              
              
                
                  
                    
                    Telnyx API Key
                  
                  
                    
                    TeXML App / Connection ID
                  
                
              
            

            {/* Direct SIP Card */}
             handleSelect('sip') : undefined}
              aria-disabled={!canSwitchToSip}
            >
              
                
                  
                    {activeEngine === 'sip' && }
                  
                  
                    Direct SIP (Drachtio)
                    
                      Direct SIP trunk. Lowest latency, lowest cost. Falls back to TeXML if unavailable.
                    
                    {!canSwitchToSip && sipAvailabilityIssue && (
                      {sipAvailabilityIssue}
                    )}
                    
                      {activeEngine === 'sip' && Active}
                      {numbersData?.totals.sip ?? '?'} numbers
                    
                  
                
              
              
                
                  
                    
                    SIP Calling Enabled
                  
                  
                    
                    Drachtio Host
                  
                  
                    
                    Public IP
                  
                
              
            
          

          {/* Number Pool Management */}
          
            
              Number Pool Management
              
                Move phone numbers between TeXML and SIP connections. Each engine only uses numbers assigned to its connection.
              
            
            
              {numbersLoading ? (
                
                  
                
              ) : (
                
                  {/* TeXML Numbers */}
                  
                    
                      
                        TeXML Pool
                        {numbersData?.totals.texml ?? 0}
                      
                      {selectedTexml.size > 0 && (
                        {selectedTexml.size} selected
                      )}
                    
                    
                      
                    
                  

                  {/* Move Buttons */}
                  
                    
                      {moveMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                    
                    
                      {moveMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                    
                  

                  {/* SIP Numbers */}
                  
                    
                      
                        SIP Pool
                        {numbersData?.totals.sip ?? 0}
                      
                      {selectedSip.size > 0 && (
                        {selectedSip.size} selected
                      )}
                    
                    
                      
                    
                  
                
              )}
            
          
        
      )}

      {/* Confirmation Dialog */}
      
        
          
            Switch Voice Engine?
            
              This will route all new AI calls through{' '}
              {pendingEngine === 'sip' ? 'Direct SIP (Drachtio)' : 'Telnyx TeXML'}.
              The number pool will automatically switch to use only{' '}
              {pendingEngine === 'sip' ? 'SIP' : 'TeXML'} numbers.
              Existing in-progress calls will not be affected.
              {pendingEngine === 'sip' && ' If SIP is unavailable, calls will automatically fall back to TeXML.'}
            
          
          
            Cancel
            
              {switchMutation.isPending ? 'Switching...' : 'Switch Engine'}
            
          
        
      
    
  );
}