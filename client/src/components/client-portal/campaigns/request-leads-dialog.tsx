import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Target, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Campaign {
  id: string;
  name: string;
  eligibleCount?: number;
  deliveredCount?: number;
}

interface RequestLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  campaigns: Campaign[];
  preselectedCampaignId?: string;
}

export function RequestLeadsDialog({
  open,
  onClose,
  campaigns,
  preselectedCampaignId
}: RequestLeadsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedCampaignId, setSelectedCampaignId] = useState(preselectedCampaignId || '');
  const [requestedQuantity, setRequestedQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');

  const getToken = () => localStorage.getItem('clientPortalToken');

  const requestLeadsMutation = useMutation({
    mutationFn: async (data: {
      campaignId: string;
      requestedQuantity: number;
      notes?: string;
      priority: string;
    }) => {
      const res = await fetch('/api/client-portal/campaigns/request-additional-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to submit request');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Request Submitted',
        description: 'Your request for additional leads has been submitted successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['client-portal-activity'] });
      queryClient.invalidateQueries({ queryKey: ['client-portal-campaigns'] });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Request Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setSelectedCampaignId('');
    setRequestedQuantity('');
    setNotes('');
    setPriority('normal');
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedCampaignId) {
      toast({ title: 'Please select a campaign', variant: 'destructive' });
      return;
    }
    if (!requestedQuantity || parseInt(requestedQuantity) < 1) {
      toast({ title: 'Please enter a valid quantity', variant: 'destructive' });
      return;
    }

    requestLeadsMutation.mutate({
      campaignId: selectedCampaignId,
      requestedQuantity: parseInt(requestedQuantity),
      notes: notes.trim() || undefined,
      priority,
    });
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  useEffect(() => {
    if (preselectedCampaignId && open) {
      setSelectedCampaignId(preselectedCampaignId);
    }
  }, [preselectedCampaignId, open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Request Additional Leads
          </DialogTitle>
          <DialogDescription>
            Extend your campaign by requesting more leads. Our team will review and process your request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Campaign Selection */}
          <div className="space-y-2">
            <Label>Select Campaign</Label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a campaign..." />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      {campaign.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campaign Stats */}
          {selectedCampaign && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                {selectedCampaign.name}
              </p>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300">
                  <Users className="h-3.5 w-3.5" />
                  <span>{selectedCampaign.eligibleCount?.toLocaleString() || 0} eligible</span>
                </div>
                <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>{selectedCampaign.deliveredCount?.toLocaleString() || 0} delivered</span>
                </div>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Number of Additional Leads</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              placeholder="e.g., 50"
              value={requestedQuantity}
              onChange={(e) => setRequestedQuantity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter the number of additional leads you'd like to request
            </p>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority Level</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={priority === 'normal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPriority('normal')}
                className="flex-1"
              >
                Normal
              </Button>
              <Button
                type="button"
                variant={priority === 'urgent' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setPriority('urgent')}
                className="flex-1"
              >
                <AlertCircle className="h-3.5 w-3.5 mr-1" />
                Urgent
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any specific requirements or timeline preferences..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Summary */}
          {selectedCampaign && requestedQuantity && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border">
              <p className="text-sm font-medium mb-1">Request Summary</p>
              <p className="text-xs text-muted-foreground">
                Requesting <span className="font-semibold text-foreground">{parseInt(requestedQuantity).toLocaleString()}</span> additional leads for{' '}
                <span className="font-semibold text-foreground">{selectedCampaign.name}</span>
                {priority === 'urgent' && (
                  <Badge variant="destructive" className="ml-2 text-[10px]">URGENT</Badge>
                )}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={requestLeadsMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={requestLeadsMutation.isPending || !selectedCampaignId || !requestedQuantity}
          >
            {requestLeadsMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Submit Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
