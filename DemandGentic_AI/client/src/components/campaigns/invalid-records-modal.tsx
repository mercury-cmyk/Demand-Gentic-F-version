/**
 * Invalid Records Modal
 *
 * Displays invalid queue items (contacts with no valid phone number)
 * and provides actions to remove them or send to data cleaning pipeline.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  Trash2,
  Wrench,
  Loader2,
  Phone,
  User,
  Building2,
} from 'lucide-react';

interface InvalidItem {
  id: string;
  campaignId: string;
  contactId: string;
  accountId: string;
  invalidReason: string;
  queuedAt: string;
  contact?: {
    firstName: string;
    lastName: string;
    email: string;
    directPhone: string;
    directPhoneE164: string;
    mobilePhone: string;
    mobilePhoneE164: string;
    dialingPhone: string;
  };
  account?: {
    name: string;
  };
}

interface InvalidRecordsModalProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const reasonLabels: Record = {
  no_phone_number: 'No phone number on contact record',
  contact_not_found: 'Contact record missing/deleted',
  invalid_format: 'Phone number format invalid',
};

export function InvalidRecordsModal({ campaignId, open, onOpenChange }: InvalidRecordsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actionInProgress, setActionInProgress] = useState(null);

  // Fetch invalid items when modal opens
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/campaigns', campaignId, 'queue', 'invalid'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/campaigns/${campaignId}/queue/invalid`);
      return res.json();
    },
    enabled: open,
  });

  const invalidItems = data?.items || [];

  // Bulk remove all invalid items
  const removeAllMutation = useMutation({
    mutationFn: async () => {
      setActionInProgress('remove');
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/queue/invalid/remove-all`);
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Invalid Records Removed',
        description: `${result.removed} invalid record(s) removed from the queue.`,
      });
      // Refresh stats and invalid list
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'queue'] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/queue/stats`] });
      refetch();
      setActionInProgress(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove invalid records',
        variant: 'destructive',
      });
      setActionInProgress(null);
    },
  });

  // Send to data cleaning pipeline
  const cleanMutation = useMutation({
    mutationFn: async () => {
      setActionInProgress('clean');
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/queue/invalid/clean`);
      return res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Sent to Data Cleaning',
        description: `${result.sent} record(s) sent to the data cleaning pipeline for correction.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'queue'] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/queue/stats`] });
      refetch();
      setActionInProgress(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send to cleaning pipeline',
        variant: 'destructive',
      });
      setActionInProgress(null);
    },
  });

  return (
    
      
        
          
            
            Invalid Queue Records
          
          
            These contacts are in the queue but cannot be called due to missing or invalid phone data.
            They will be automatically skipped by the dialer but continue occupying queue slots.
          
        

        
          {isLoading ? (
            
              
              Scanning for invalid records...
            
          ) : invalidItems.length === 0 ? (
            
              
              No invalid records found. Queue is clean!
            
          ) : (
            <>
              {/* Summary bar */}
              
                
                  
                  
                    {invalidItems.length} invalid record{invalidItems.length !== 1 ? 's' : ''} found
                  
                
                
                   removeAllMutation.mutate()}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'remove' ? (
                      
                    ) : (
                      
                    )}
                    Remove All
                  
                   cleanMutation.mutate()}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'clean' ? (
                      
                    ) : (
                      
                    )}
                    Send to Cleaning
                  
                
              

              {/* Items table */}
              
                
                  
                    Contact
                    Account
                    Phone Data
                    Issue
                    Queued At
                  
                
                
                  {invalidItems.map((item) => (
                    
                      
                        
                          
                          
                            
                              {item.contact
                                ? `${item.contact.firstName || ''} ${item.contact.lastName || ''}`.trim() || 'Unnamed'
                                : 'Missing Contact'}
                            
                            {item.contact?.email && (
                              {item.contact.email}
                            )}
                          
                        
                      
                      
                        
                          
                          {item.account?.name || 'Unknown'}
                        
                      
                      
                        
                          {item.contact?.directPhone || item.contact?.directPhoneE164 ? (
                            Direct: {item.contact.directPhoneE164 || item.contact.directPhone}
                          ) : null}
                          {item.contact?.mobilePhone || item.contact?.mobilePhoneE164 ? (
                            Mobile: {item.contact.mobilePhoneE164 || item.contact.mobilePhone}
                          ) : null}
                          {!item.contact?.directPhone && !item.contact?.directPhoneE164 &&
                           !item.contact?.mobilePhone && !item.contact?.mobilePhoneE164 && (
                            None
                          )}
                        
                      
                      
                        
                          {reasonLabels[item.invalidReason] || item.invalidReason.replace(/_/g, ' ')}
                        
                      
                      
                        {new Date(item.queuedAt).toLocaleString()}
                      
                    
                  ))}
                
              
            
          )}
        

        
          
            Invalid records are automatically flagged each orchestrator tick.
          
           onOpenChange(false)}>
            Close
          
        
      
    
  );
}