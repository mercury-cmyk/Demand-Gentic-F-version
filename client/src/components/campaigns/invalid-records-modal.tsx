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

const reasonLabels: Record<string, string> = {
  no_phone_number: 'No phone number on contact record',
  contact_not_found: 'Contact record missing/deleted',
  invalid_format: 'Phone number format invalid',
};

export function InvalidRecordsModal({ campaignId, open, onOpenChange }: InvalidRecordsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Fetch invalid items when modal opens
  const { data, isLoading, refetch } = useQuery<{ items: InvalidItem[]; count: number }>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Invalid Queue Records
          </DialogTitle>
          <DialogDescription>
            These contacts are in the queue but cannot be called due to missing or invalid phone data.
            They will be automatically skipped by the dialer but continue occupying queue slots.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Scanning for invalid records...</span>
            </div>
          ) : invalidItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Phone className="w-8 h-8 mb-2" />
              <p className="text-sm">No invalid records found. Queue is clean!</p>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex items-center justify-between p-3 mb-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">
                    {invalidItems.length} invalid record{invalidItems.length !== 1 ? 's' : ''} found
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700"
                    onClick={() => removeAllMutation.mutate()}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'remove' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3 mr-1" />
                    )}
                    Remove All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700"
                    onClick={() => cleanMutation.mutate()}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'clean' ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Wrench className="w-3 h-3 mr-1" />
                    )}
                    Send to Cleaning
                  </Button>
                </div>
              </div>

              {/* Items table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contact</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Phone Data</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Queued At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invalidItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">
                              {item.contact
                                ? `${item.contact.firstName || ''} ${item.contact.lastName || ''}`.trim() || 'Unnamed'
                                : 'Missing Contact'}
                            </p>
                            {item.contact?.email && (
                              <p className="text-xs text-muted-foreground">{item.contact.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{item.account?.name || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono space-y-0.5">
                          {item.contact?.directPhone || item.contact?.directPhoneE164 ? (
                            <p>Direct: {item.contact.directPhoneE164 || item.contact.directPhone}</p>
                          ) : null}
                          {item.contact?.mobilePhone || item.contact?.mobilePhoneE164 ? (
                            <p>Mobile: {item.contact.mobilePhoneE164 || item.contact.mobilePhone}</p>
                          ) : null}
                          {!item.contact?.directPhone && !item.contact?.directPhoneE164 &&
                           !item.contact?.mobilePhone && !item.contact?.mobilePhoneE164 && (
                            <p className="text-red-500 italic">None</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-600 border-red-500/20 text-xs"
                        >
                          {reasonLabels[item.invalidReason] || item.invalidReason.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(item.queuedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Invalid records are automatically flagged each orchestrator tick.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
