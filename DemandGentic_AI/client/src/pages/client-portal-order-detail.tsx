import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Check, X, Download, Edit2, MessageSquare, FileText, Send, Package, DollarSign } from 'lucide-react';

export default function ClientPortalOrderDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showFulfill, setShowFulfill] = useState(false);
  const [showEditContact, setShowEditContact] = useState(null);
  const [approvedQuantity, setApprovedQuantity] = useState(null);
  const [costPerLead, setCostPerLead] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [editedData, setEditedData] = useState>({});
  const [adminComment, setAdminComment] = useState('');

  const { data: orderData, isLoading, refetch } = useQuery({
    queryKey: ['/api/client-portal/admin/orders', id],
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PATCH', `/api/client-portal/admin/orders/${id}/approve`, {
        approvedQuantity: approvedQuantity || orderData?.order?.requestedQuantity,
        costPerLead,
        adminNotes,
      });
    },
    onSuccess: () => {
      refetch();
      setShowApprove(false);
      toast({ title: 'Order approved successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to approve order', variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PATCH', `/api/client-portal/admin/orders/${id}/reject`, { rejectionReason });
    },
    onSuccess: () => {
      refetch();
      setShowReject(false);
      toast({ title: 'Order rejected' });
    },
    onError: () => {
      toast({ title: 'Failed to reject order', variant: 'destructive' });
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/client-portal/admin/orders/${id}/fulfill`, {});
    },
    onSuccess: () => {
      refetch();
      setShowFulfill(false);
      toast({ title: 'Order fulfilled successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to fulfill order', variant: 'destructive' });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest('PATCH', `/api/client-portal/admin/orders/${id}/contacts/${contactId}`, {
        editedData,
        adminComment,
      });
    },
    onSuccess: () => {
      refetch();
      setShowEditContact(null);
      setEditedData({});
      setAdminComment('');
      toast({ title: 'Contact updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update contact', variant: 'destructive' });
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/client-portal/admin/orders/${id}/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      const data = await response.json();

      const headers = Object.keys(data[0] || {});
      const csvContent = [
        headers.join(','),
        ...data.map((row: any) =>
          headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-${orderData?.order?.orderNumber || id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Export downloaded' });
    } catch (error) {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const handleEditContact = (orderContact: any, contact: any) => {
    setShowEditContact({ orderContact, contact });
    setEditedData((orderContact.editedData || {}) as Record);
    setAdminComment(orderContact.adminComment || '');
  };

  if (isLoading) {
    return Loading...;
  }

  if (!orderData) {
    return Order not found;
  }

  const { order, client, campaign, contacts } = orderData;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'default';
      case 'approved': return 'default';
      case 'completed': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    
      
         setLocation('/client-portal-admin')} data-testid="button-back">
          
          Back
        
        
          Order {order.orderNumber}
          {client.name} - {campaign.name}
        
        
          {order.status}
        
      

      
        
          
            Order Details
          
          
            
              Requested
              {order.requestedQuantity}
            
            {order.approvedQuantity && (
              
                Approved
                {order.approvedQuantity}
              
            )}
            
              Delivered
              {order.deliveredQuantity}
            
            
              Period
              {order.orderMonth}/{order.orderYear}
            
            {order.clientNotes && (
              
                Client Notes:
                {order.clientNotes}
              
            )}
            {order.adminNotes && (
              
                Admin Notes:
                {order.adminNotes}
              
            )}
          
        

        
          
            
              Actions
              Manage this order
            
          
          
            
              {['submitted', 'pending'].includes(order.status) && (
                <>
                   { setApprovedQuantity(order.requestedQuantity); setCostPerLead(order.ratePerLead || null); setShowApprove(true); }} data-testid="button-approve">
                    
                    Approve
                  
                   setShowReject(true)} data-testid="button-reject">
                    
                    Reject
                  
                
              )}
              {order.status === 'approved' && (
                 setShowFulfill(true)} data-testid="button-fulfill">
                  
                  Fulfill Order
                
              )}
              {order.status === 'completed' && contacts && contacts.length > 0 && (
                
                  
                  Export CSV
                
              )}
            
          
        
      

      {order.status === 'completed' && contacts && contacts.length > 0 && (
        
          
            
              
              Delivered Contacts ({contacts.length})
            
            Preview, edit, and comment on contacts before export
          
          
            
              
                
                  
                    #
                    Name
                    Email
                    Title
                    Phone
                    Comment
                    Actions
                  
                
                
                  {contacts.map((item: any, index: number) => {
                    const c = item.contact;
                    const oc = item.orderContact;
                    const edited = (oc.editedData || {}) as Record;
                    return (
                      
                        {index + 1}
                        
                          {edited.fullName || c.fullName || `${edited.firstName || c.firstName || ''} ${edited.lastName || c.lastName || ''}`}
                        
                        {edited.email || c.email}
                        {edited.title || c.title}
                        {edited.phone || c.phone || c.mobile}
                        
                          {oc.adminComment && (
                            {oc.adminComment}
                          )}
                        
                        
                           handleEditContact(oc, c)}
                            data-testid={`button-edit-contact-${oc.id}`}
                          >
                            
                          
                        
                      
                    );
                  })}
                
              
            
          
        
      )}

      
        
          
            Approve Order
            Set the CPL rate, approved quantity and add notes
          
          
            
              Cost Per Lead (CPL) *
              
                
                 setCostPerLead(e.target.value ? parseFloat(e.target.value) : null)}
                  data-testid="input-cost-per-lead"
                />
              
              Set the rate per qualified lead for billing
            
            
              Approved Quantity
               setApprovedQuantity(parseInt(e.target.value) || 0)}
                data-testid="input-approved-quantity"
              />
              Requested: {order.requestedQuantity}
            
            
              Admin Notes (optional)
               setAdminNotes(e.target.value)}
                data-testid="input-admin-notes"
              />
            
          
          
             setShowApprove(false)}>Cancel
             approveMutation.mutate()} disabled={approveMutation.isPending || !costPerLead} data-testid="button-confirm-approve">
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            
          
        
      

      
        
          
            Reject Order
            Provide a reason for rejection
          
          
            
              Rejection Reason
               setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                data-testid="input-rejection-reason"
              />
            
          
          
             setShowReject(false)}>Cancel
             rejectMutation.mutate()} disabled={rejectMutation.isPending} data-testid="button-confirm-reject">
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
            
          
        
      

      
        
          
            Fulfill Order
            
              This will select {order.approvedQuantity || order.requestedQuantity} eligible contacts from the campaign pool.
            
          
          
             setShowFulfill(false)}>Cancel
             fulfillMutation.mutate()} disabled={fulfillMutation.isPending} data-testid="button-confirm-fulfill">
              {fulfillMutation.isPending ? 'Fulfilling...' : 'Fulfill Order'}
            
          
        
      

       setShowEditContact(null)}>
        
          
            Edit Contact
            Override contact data for this delivery
          
          {showEditContact && (
            
              
                
                  First Name
                   setEditedData({ ...editedData, firstName: e.target.value })}
                    data-testid="input-edit-firstname"
                  />
                
                
                  Last Name
                   setEditedData({ ...editedData, lastName: e.target.value })}
                    data-testid="input-edit-lastname"
                  />
                
              
              
                Email
                 setEditedData({ ...editedData, email: e.target.value })}
                  data-testid="input-edit-email"
                />
              
              
                Title
                 setEditedData({ ...editedData, title: e.target.value })}
                  data-testid="input-edit-title"
                />
              
              
                
                  Phone
                   setEditedData({ ...editedData, phone: e.target.value })}
                    data-testid="input-edit-phone"
                  />
                
                
                  Mobile
                   setEditedData({ ...editedData, mobile: e.target.value })}
                    data-testid="input-edit-mobile"
                  />
                
              
              
                
                  
                  Admin Comment
                
                 setAdminComment(e.target.value)}
                  placeholder="Add a comment about this contact..."
                  data-testid="input-admin-comment"
                />
              
            
          )}
          
             setShowEditContact(null)}>Cancel
             updateContactMutation.mutate(showEditContact.orderContact.id)}
              disabled={updateContactMutation.isPending}
              data-testid="button-save-contact"
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
            
          
        
      
    
  );
}