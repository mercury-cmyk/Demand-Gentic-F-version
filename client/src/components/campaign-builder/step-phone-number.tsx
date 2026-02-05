/**
 * Step: Phone Number Selection
 * 
 * Allows selection of a Telnyx phone number from the number pool
 * to use as the caller ID for this campaign.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Phone, RefreshCw, AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface StepPhoneNumberProps {
  data: {
    callerPhoneNumberId?: string;
    callerPhoneNumber?: string;
  };
  onChange: (data: { callerPhoneNumberId?: string; callerPhoneNumber?: string }) => void;
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

export function StepPhoneNumber({ data, onChange }: StepPhoneNumberProps) {
  const { toast } = useToast();
  const [selectedNumberId, setSelectedNumberId] = useState<string>(data.callerPhoneNumberId || '');

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

  // Update parent when selection changes
  useEffect(() => {
    if (selectedNumberId && selectedNumber) {
      onChange({
        callerPhoneNumberId: selectedNumberId,
        callerPhoneNumber: selectedNumber.phoneNumberE164,
      });
    } else if (!selectedNumberId) {
      onChange({
        callerPhoneNumberId: undefined,
        callerPhoneNumber: undefined,
      });
    }
  }, [selectedNumberId, selectedNumber, onChange]);

  // Restore selection from data
  useEffect(() => {
    if (data.callerPhoneNumberId && data.callerPhoneNumberId !== selectedNumberId) {
      setSelectedNumberId(data.callerPhoneNumberId);
    }
  }, [data.callerPhoneNumberId]);

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
                value={selectedNumberId}
                onValueChange={setSelectedNumberId}
              >
                <SelectTrigger id="phone-number" className="w-full">
                  <SelectValue placeholder="Select a phone number..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
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
    </div>
  );
}

export default StepPhoneNumber;
