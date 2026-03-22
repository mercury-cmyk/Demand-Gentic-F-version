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
  const [priority, setPriority] = useState('normal');

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
    if (!requestedQuantity || parseInt(requestedQuantity)  c.id === selectedCampaignId);

  useEffect(() => {
    if (preselectedCampaignId && open) {
      setSelectedCampaignId(preselectedCampaignId);
    }
  }, [preselectedCampaignId, open]);

  return (
     !o && handleClose()}>
      
        
          
            
            Request Additional Leads
          
          
            Extend your campaign by requesting more leads. Our team will review and process your request.
          
        

        
          {/* Campaign Selection */}
          
            Select Campaign
            
              
                
              
              
                {campaigns.map((campaign) => (
                  
                    
                      
                      {campaign.name}
                    
                  
                ))}
              
            
          

          {/* Campaign Stats */}
          {selectedCampaign && (
            
              
                {selectedCampaign.name}
              
              
                
                  
                  {selectedCampaign.eligibleCount?.toLocaleString() || 0} eligible
                
                
                  
                  {selectedCampaign.deliveredCount?.toLocaleString() || 0} delivered
                
              
            
          )}

          {/* Quantity */}
          
            Number of Additional Leads
             setRequestedQuantity(e.target.value)}
            />
            
              Enter the number of additional leads you'd like to request
            
          

          {/* Priority */}
          
            Priority Level
            
               setPriority('normal')}
                className="flex-1"
              >
                Normal
              
               setPriority('urgent')}
                className="flex-1"
              >
                
                Urgent
              
            
          

          {/* Notes */}
          
            Additional Notes (Optional)
             setNotes(e.target.value)}
              rows={3}
            />
          

          {/* Summary */}
          {selectedCampaign && requestedQuantity && (
            
              Request Summary
              
                Requesting {parseInt(requestedQuantity).toLocaleString()} additional leads for{' '}
                {selectedCampaign.name}
                {priority === 'urgent' && (
                  URGENT
                )}
              
            
          )}
        

        
          
            Cancel
          
          
            {requestLeadsMutation.isPending ? (
              <>
                
                Submitting...
              
            ) : (
              <>
                
                Submit Request
              
            )}
          
        
      
    
  );
}