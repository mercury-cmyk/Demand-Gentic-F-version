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
  const configs: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    active: { variant: 'default', label: 'Active' },
    cooling: { variant: 'secondary', label: 'Cooling Down' },
    suspended: { variant: 'destructive', label: 'Suspended' },
    retired: { variant: 'outline', label: 'Retired' },
  };
  const config = configs[status] || { variant: 'outline', label: status };
  return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
}

// ==================== COMPONENT ====================

export function StepPhoneNumber({ data, onNext, onBack, onChange }: StepPhoneNumberProps) {
  const { toast } = useToast();
  const [selectedNumberId, setSelectedNumberId] = useState<string>(data?.callerPhoneNumberId || '');

  // Number Pool Rotation Configuration
  const [numberPoolConfig, setNumberPoolConfig] = useState<NumberPoolConfig>(() => ({
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
  } = useQuery<NumberPoolResponse>({
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Caller Phone Number
          </CardTitle>
          <CardDescription>
            Select the Telnyx phone number to use as the Caller ID for this campaign.
            All outbound calls will display this number to the recipient.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Number Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="phone-number">Select Phone Number</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-1">Sync from Telnyx</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Fetch latest phone numbers from your Telnyx account</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {numbersLoading ? (
              <div className="flex items-center justify-center p-4 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading phone numbers...
              </div>
            ) : numbersError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load phone numbers. Please try again or sync from Telnyx.
                </AlertDescription>
              </Alert>
            ) : numbers.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>No Phone Numbers Available</AlertTitle>
                <AlertDescription>
                  No active phone numbers found in your number pool. Click "Sync from Telnyx" 
                  to import your phone numbers, or add numbers in the Number Pool management section.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedNumberId || '__default__'}
                onValueChange={(value) => setSelectedNumberId(value === '__default__' ? '' : value)}
              >
                <SelectTrigger id="phone-number" className="w-full">
                  <SelectValue placeholder="Select a phone number..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    <span className="text-muted-foreground">Use default number (env)</span>
                  </SelectItem>
                  {numbers.map((number) => (
                    <SelectItem key={number.id} value={number.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{formatPhoneNumber(number.phoneNumberE164)}</span>
                        {number.displayName && (
                          <span className="text-muted-foreground text-sm">- {number.displayName}</span>
                        )}
                        {number.region && (
                          <Badge variant="outline" className="text-xs">{number.region}</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Selected Number Details */}
          {selectedNumber && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Selected Number</span>
                    </div>
                    <p className="text-2xl font-mono font-bold">
                      {formatPhoneNumber(selectedNumber.phoneNumberE164)}
                    </p>
                    {selectedNumber.displayName && (
                      <p className="text-sm text-muted-foreground">{selectedNumber.displayName}</p>
                    )}
                  </div>
                  <div className="text-right space-y-2">
                    {getStatusBadge(selectedNumber.status)}
                    {selectedNumber.region && (
                      <p className="text-sm text-muted-foreground">{selectedNumber.region}</p>
                    )}
                    {selectedNumber.areaCode && (
                      <p className="text-xs text-muted-foreground">Area Code: {selectedNumber.areaCode}</p>
                    )}
                  </div>
                </div>
                {selectedNumber.tags && selectedNumber.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {selectedNumber.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Info Box */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>About Caller ID</AlertTitle>
            <AlertDescription>
              The selected phone number will be displayed as the Caller ID for all outbound calls
              in this campaign. If no number is selected, the default environment number will be used.
              Ensure the number is properly configured in your Telnyx account for optimal deliverability.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Number Pool Rotation Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            Automatic Number Rotation
          </CardTitle>
          <CardDescription>
            Automatically rotate through phone numbers to avoid spam flags and maintain caller reputation.
            This helps keep your campaigns out of spam filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base font-medium flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                Enable Number Pool Rotation
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically switch between available numbers to distribute call volume
              </p>
            </div>
            <Switch
              checked={numberPoolConfig.enabled}
              onCheckedChange={(checked) =>
                setNumberPoolConfig((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          {numberPoolConfig.enabled && (
            <div className="space-y-4 pt-2">
              {/* Rotation Strategy */}
              <div className="space-y-2">
                <Label htmlFor="rotation-strategy" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Rotation Strategy
                </Label>
                <Select
                  value={numberPoolConfig.rotationStrategy}
                  onValueChange={(value: 'round_robin' | 'reputation_based' | 'region_match') =>
                    setNumberPoolConfig((prev) => ({ ...prev, rotationStrategy: value }))
                  }
                >
                  <SelectTrigger id="rotation-strategy">
                    <SelectValue placeholder="Select strategy..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reputation_based">
                      <div className="flex flex-col">
                        <span className="font-medium">Reputation-Based (Recommended)</span>
                        <span className="text-xs text-muted-foreground">
                          Prioritizes numbers with higher answer rates
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="round_robin">
                      <div className="flex flex-col">
                        <span className="font-medium">Round Robin</span>
                        <span className="text-xs text-muted-foreground">
                          Cycles through numbers evenly
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="region_match">
                      <div className="flex flex-col">
                        <span className="font-medium">Region Matching</span>
                        <span className="text-xs text-muted-foreground">
                          Matches caller ID to prospect's region
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max Calls Per Number */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-calls">Max Calls Per Number</Label>
                  <Input
                    id="max-calls"
                    type="number"
                    min={10}
                    max={200}
                    value={numberPoolConfig.maxCallsPerNumber}
                    onChange={(e) =>
                      setNumberPoolConfig((prev) => ({
                        ...prev,
                        maxCallsPerNumber: parseInt(e.target.value) || 50,
                      }))
                    }
                    placeholder="50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number rotates after this many calls
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cooldown-hours">Cooldown Period (hours)</Label>
                  <Input
                    id="cooldown-hours"
                    type="number"
                    min={1}
                    max={24}
                    value={numberPoolConfig.cooldownHours}
                    onChange={(e) =>
                      setNumberPoolConfig((prev) => ({
                        ...prev,
                        cooldownHours: parseInt(e.target.value) || 4,
                      }))
                    }
                    placeholder="4"
                  />
                  <p className="text-xs text-muted-foreground">
                    Rest period after hitting limits
                  </p>
                </div>
              </div>

              {/* Active Pool Summary */}
              {numbers.length > 0 && (
                <Alert className="bg-green-500/10 border-green-500/30">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertTitle className="text-green-700">Number Pool Ready</AlertTitle>
                  <AlertDescription className="text-green-600">
                    {numbers.length} active number{numbers.length !== 1 ? 's' : ''} available for rotation.
                    The system will automatically distribute calls across these numbers
                    to maintain reputation and avoid spam flags.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {!numberPoolConfig.enabled && (
            <Alert variant="destructive" className="bg-orange-500/10 border-orange-500/30">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <AlertTitle className="text-orange-700">Single Number Mode</AlertTitle>
              <AlertDescription className="text-orange-600">
                All calls will use the selected caller ID above. This may increase the risk
                of spam flags if making high-volume calls. We recommend enabling rotation
                for campaigns with more than 50 daily calls.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-end">
        <Button onClick={handleNext}>
          Next Step
        </Button>
      </div>
    </div>
  );
}

export default StepPhoneNumber;
