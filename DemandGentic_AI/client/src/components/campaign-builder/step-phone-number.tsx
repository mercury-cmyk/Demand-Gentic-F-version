/**
 * Step: Phone Number Selection
 *
 * Allows selection of a Telnyx phone number from the number pool
 * to use as the caller ID for this campaign.
 *
 * Also supports automatic number pool rotation to avoid spam flags.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Phone, RefreshCw, AlertCircle, CheckCircle2, Info, Loader2, RotateCcw, Shield, Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ==================== TYPES ====================

interface TelnyxNumber {
  id: string;
  phoneNumberE164: string;
  displayName?: string;
  region?: string;
  areaCode?: string;
  status: 'active' | 'cooling' | 'suspended' | 'retired';
  tags?: string[];
}

interface NumberPoolResponse {
  success: boolean;
  data: TelnyxNumber[];
  count: number;
}

interface NumberPoolConfig {
  enabled: boolean;
  maxCallsPerNumber?: number;
  rotationStrategy?: 'round_robin' | 'reputation_based' | 'region_match';
  cooldownHours?: number;
}

interface StepPhoneNumberProps {
  data: any;
  onNext: (data: any) => void;
  onBack?: () => void;
  onChange?: (data: any) => void;
}

// ==================== HELPERS ====================

function formatPhoneNumber(e164: string): string {
  // Format +1XXXXXXXXXX to (XXX) XXX-XXXX
  if (e164.startsWith('+1') && e164.length === 12) {
    const area = e164.substring(2, 5);
    const exchange = e164.substring(5, 8);
    const subscriber = e164.substring(8, 12);
    return `(${area}) ${exchange}-${subscriber}`;
  }
  return e164;
}

function getStatusBadge(status: string) {
  const configs: Record = {
    active: { variant: 'default', label: 'Active' },
    cooling: { variant: 'secondary', label: 'Cooling Down' },
    suspended: { variant: 'destructive', label: 'Suspended' },
    retired: { variant: 'outline', label: 'Retired' },
  };
  const config = configs[status] || { variant: 'outline', label: status };
  return {config.label};
}

// ==================== COMPONENT ====================

export function StepPhoneNumber({ data, onNext, onBack, onChange }: StepPhoneNumberProps) {
  const { toast } = useToast();
  const [selectedNumberId, setSelectedNumberId] = useState(data?.callerPhoneNumberId || '');

  // Number Pool Rotation Configuration
  const [numberPoolConfig, setNumberPoolConfig] = useState(() => ({
    enabled: data?.numberPoolConfig?.enabled ?? true, // Default to enabled
    maxCallsPerNumber: data?.numberPoolConfig?.maxCallsPerNumber ?? 50,
    rotationStrategy: data?.numberPoolConfig?.rotationStrategy ?? 'reputation_based',
    cooldownHours: data?.numberPoolConfig?.cooldownHours ?? 4,
  }));

  // Fetch available phone numbers from the number pool
  const {
    data: numbersResponse,
    isLoading: numbersLoading,
    error: numbersError,
    refetch: refetchNumbers,
  } = useQuery({
    queryKey: ['telnyx-numbers', 'active'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/number-pool/numbers?status=active');
      if (!res.ok) throw new Error('Failed to fetch phone numbers');
      return res.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Sync numbers from Telnyx mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/number-pool/sync');
      if (!res.ok) throw new Error('Failed to sync with Telnyx');
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: 'Sync Complete',
        description: `Added ${result.data.added}, updated ${result.data.updated}, removed ${result.data.removed} numbers`,
      });
      refetchNumbers();
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Could not sync with Telnyx',
        variant: 'destructive',
      });
    },
  });

  const numbers = numbersResponse?.data || [];
  const selectedNumber = numbers.find(n => n.id === selectedNumberId);

  // Update parent when selection or config changes (if onChange is provided)
  useEffect(() => {
    if (onChange) {
      onChange({
        callerPhoneNumberId: selectedNumberId || undefined,
        callerPhoneNumber: selectedNumber?.phoneNumberE164 || undefined,
        numberPoolConfig: numberPoolConfig,
      });
    }
  }, [selectedNumberId, selectedNumber, numberPoolConfig, onChange]);

  // Restore selection from data
  useEffect(() => {
    if (data?.callerPhoneNumberId && data.callerPhoneNumberId !== selectedNumberId) {
      setSelectedNumberId(data.callerPhoneNumberId);
    }
  }, [data?.callerPhoneNumberId]);

  // Handle next step
  const handleNext = () => {
    onNext({
      ...data,
      callerPhoneNumberId: selectedNumberId || undefined,
      callerPhoneNumber: selectedNumber?.phoneNumberE164 || undefined,
      numberPoolConfig: numberPoolConfig,
    });
  };

  return (
    
      
        
          
            
            Caller Phone Number
          
          
            Select the Telnyx phone number to use as the Caller ID for this campaign.
            All outbound calls will display this number to the recipient.
          
        
        
          {/* Number Selection */}
          
            
              Select Phone Number
              
                
                  
                     syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                      Sync from Telnyx
                    
                  
                  
                    Fetch latest phone numbers from your Telnyx account
                  
                
              
            

            {numbersLoading ? (
              
                
                Loading phone numbers...
              
            ) : numbersError ? (
              
                
                Error
                
                  Failed to load phone numbers. Please try again or sync from Telnyx.
                
              
            ) : numbers.length === 0 ? (
              
                
                No Phone Numbers Available
                
                  No active phone numbers found in your number pool. Click "Sync from Telnyx" 
                  to import your phone numbers, or add numbers in the Number Pool management section.
                
              
            ) : (
               setSelectedNumberId(value === '__default__' ? '' : value)}
              >
                
                  
                
                
                  
                    Use default number (env)
                  
                  {numbers.map((number) => (
                    
                      
                        {formatPhoneNumber(number.phoneNumberE164)}
                        {number.displayName && (
                          - {number.displayName}
                        )}
                        {number.region && (
                          {number.region}
                        )}
                      
                    
                  ))}
                
              
            )}
          

          {/* Selected Number Details */}
          {selectedNumber && (
            
              
                
                  
                    
                      
                      Selected Number
                    
                    
                      {formatPhoneNumber(selectedNumber.phoneNumberE164)}
                    
                    {selectedNumber.displayName && (
                      {selectedNumber.displayName}
                    )}
                  
                  
                    {getStatusBadge(selectedNumber.status)}
                    {selectedNumber.region && (
                      {selectedNumber.region}
                    )}
                    {selectedNumber.areaCode && (
                      Area Code: {selectedNumber.areaCode}
                    )}
                  
                
                {selectedNumber.tags && selectedNumber.tags.length > 0 && (
                  
                    {selectedNumber.tags.map((tag, idx) => (
                      
                        {tag}
                      
                    ))}
                  
                )}
              
            
          )}

          {/* Info Box */}
          
            
            About Caller ID
            
              The selected phone number will be displayed as the Caller ID for all outbound calls
              in this campaign. If no number is selected, the default environment number will be used.
              Ensure the number is properly configured in your Telnyx account for optimal deliverability.
            
          
        
      

      {/* Number Pool Rotation Configuration */}
      
        
          
            
            Automatic Number Rotation
          
          
            Automatically rotate through phone numbers to avoid spam flags and maintain caller reputation.
            This helps keep your campaigns out of spam filters.
          
        
        
          {/* Enable/Disable Toggle */}
          
            
              
                
                Enable Number Pool Rotation
              
              
                Automatically switch between available numbers to distribute call volume
              
            
            
                setNumberPoolConfig((prev) => ({ ...prev, enabled: checked }))
              }
            />
          

          {numberPoolConfig.enabled && (
            
              {/* Rotation Strategy */}
              
                
                  
                  Rotation Strategy
                
                
                    setNumberPoolConfig((prev) => ({ ...prev, rotationStrategy: value }))
                  }
                >
                  
                    
                  
                  
                    
                      
                        Reputation-Based (Recommended)
                        
                          Prioritizes numbers with higher answer rates
                        
                      
                    
                    
                      
                        Round Robin
                        
                          Cycles through numbers evenly
                        
                      
                    
                    
                      
                        Region Matching
                        
                          Matches caller ID to prospect's region
                        
                      
                    
                  
                
              

              {/* Max Calls Per Number */}
              
                
                  Max Calls Per Number
                  
                      setNumberPoolConfig((prev) => ({
                        ...prev,
                        maxCallsPerNumber: parseInt(e.target.value) || 50,
                      }))
                    }
                    placeholder="50"
                  />
                  
                    Number rotates after this many calls
                  
                

                
                  Cooldown Period (hours)
                  
                      setNumberPoolConfig((prev) => ({
                        ...prev,
                        cooldownHours: parseInt(e.target.value) || 4,
                      }))
                    }
                    placeholder="4"
                  />
                  
                    Rest period after hitting limits
                  
                
              

              {/* Active Pool Summary */}
              {numbers.length > 0 && (
                
                  
                  Number Pool Ready
                  
                    {numbers.length} active number{numbers.length !== 1 ? 's' : ''} available for rotation.
                    The system will automatically distribute calls across these numbers
                    to maintain reputation and avoid spam flags.
                  
                
              )}
            
          )}

          {!numberPoolConfig.enabled && (
            
              
              Single Number Mode
              
                All calls will use the selected caller ID above. This may increase the risk
                of spam flags if making high-volume calls. We recommend enabling rotation
                for campaigns with more than 50 daily calls.
              
            
          )}
        
      

      {/* Navigation */}
      
        
          Next Step
        
      
    
  );
}

export default StepPhoneNumber;