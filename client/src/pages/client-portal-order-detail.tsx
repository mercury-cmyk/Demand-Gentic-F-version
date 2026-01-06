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
import { ArrowLeft, Check, X, Download, Edit2, MessageSquare, FileText, Send, Package } from 'lucide-react';

export default function ClientPortalOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showFulfill, setShowFulfill] = useState(false);
  const [showEditContact, setShowEditContact] = useState<any>(null);
  const [approvedQuantity, setApprovedQuantity] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [adminComment, setAdminComment] = useState('');

  const { data: orderData, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/client-portal/admin/orders', id],
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PATCH', `/api/client-portal/admin/orders/${id}/approve`, {
        approvedQuantity: approvedQuantity || orderData?.order?.requestedQuantity,
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
    setEditedData((orderContact.editedData || {}) as Record<string, string>);
    setAdminComment(orderContact.adminComment || '');
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!orderData) {
    return <div className="p-6">Order not found</div>;
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/client-portal/admin')} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-order-number">Order {order.orderNumber}</h1>
          <p className="text-muted-foreground">{client.name} - {campaign.name}</p>
        </div>
        <Badge variant={getStatusColor(order.status)} className="ml-auto">
          {order.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested</span>
              <span className="font-medium">{order.requestedQuantity}</span>
            </div>
            {order.approvedQuantity && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span className="font-medium">{order.approvedQuantity}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivered</span>
              <span className="font-medium">{order.deliveredQuantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period</span>
              <span className="font-medium">{order.orderMonth}/{order.orderYear}</span>
            </div>
            {order.clientNotes && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">Client Notes:</span>
                <p className="text-sm mt-1">{order.clientNotes}</p>
              </div>
            )}
            {order.adminNotes && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">Admin Notes:</span>
                <p className="text-sm mt-1">{order.adminNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Actions</CardTitle>
              <CardDescription>Manage this order</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {order.status === 'submitted' && (
                <>
                  <Button onClick={() => { setApprovedQuantity(order.requestedQuantity); setShowApprove(true); }} data-testid="button-approve">
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setShowReject(true)} data-testid="button-reject">
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}
              {order.status === 'approved' && (
                <Button onClick={() => setShowFulfill(true)} data-testid="button-fulfill">
                  <Package className="h-4 w-4 mr-2" />
                  Fulfill Order
                </Button>
              )}
              {order.status === 'completed' && contacts && contacts.length > 0 && (
                <Button variant="outline" onClick={handleExport} data-testid="button-export">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {order.status === 'completed' && contacts && contacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Delivered Contacts ({contacts.length})
            </CardTitle>
            <CardDescription>Preview, edit, and comment on contacts before export</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((item: any, index: number) => {
                    const c = item.contact;
                    const oc = item.orderContact;
                    const edited = (oc.editedData || {}) as Record<string, unknown>;
                    return (
                      <TableRow key={oc.id} data-testid={`contact-row-${oc.id}`}>
                        <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          {edited.fullName || c.fullName || `${edited.firstName || c.firstName || ''} ${edited.lastName || c.lastName || ''}`}
                        </TableCell>
                        <TableCell>{edited.email || c.email}</TableCell>
                        <TableCell>{edited.title || c.title}</TableCell>
                        <TableCell>{edited.phone || c.phone || c.mobile}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {oc.adminComment && (
                            <span className="text-sm text-muted-foreground">{oc.adminComment}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditContact(oc, c)}
                            data-testid={`button-edit-contact-${oc.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showApprove} onOpenChange={setShowApprove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Order</DialogTitle>
            <DialogDescription>Set the approved quantity and add notes</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Approved Quantity</Label>
              <Input
                type="number"
                value={approvedQuantity || ''}
                onChange={(e) => setApprovedQuantity(parseInt(e.target.value) || 0)}
                data-testid="input-approved-quantity"
              />
              <p className="text-sm text-muted-foreground mt-1">Requested: {order.requestedQuantity}</p>
            </div>
            <div>
              <Label>Admin Notes (optional)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                data-testid="input-admin-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} data-testid="button-confirm-approve">
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Order</DialogTitle>
            <DialogDescription>Provide a reason for rejection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                data-testid="input-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending} data-testid="button-confirm-reject">
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFulfill} onOpenChange={setShowFulfill}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fulfill Order</DialogTitle>
            <DialogDescription>
              This will select {order.approvedQuantity || order.requestedQuantity} eligible contacts from the campaign pool.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFulfill(false)}>Cancel</Button>
            <Button onClick={() => fulfillMutation.mutate()} disabled={fulfillMutation.isPending} data-testid="button-confirm-fulfill">
              {fulfillMutation.isPending ? 'Fulfilling...' : 'Fulfill Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showEditContact} onOpenChange={() => setShowEditContact(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Override contact data for this delivery</DialogDescription>
          </DialogHeader>
          {showEditContact && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={editedData.firstName ?? showEditContact.contact.firstName ?? ''}
                    onChange={(e) => setEditedData({ ...editedData, firstName: e.target.value })}
                    data-testid="input-edit-firstname"
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={editedData.lastName ?? showEditContact.contact.lastName ?? ''}
                    onChange={(e) => setEditedData({ ...editedData, lastName: e.target.value })}
                    data-testid="input-edit-lastname"
                  />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={editedData.email ?? showEditContact.contact.email ?? ''}
                  onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                  data-testid="input-edit-email"
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={editedData.title ?? showEditContact.contact.title ?? ''}
                  onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                  data-testid="input-edit-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={editedData.phone ?? showEditContact.contact.phone ?? ''}
                    onChange={(e) => setEditedData({ ...editedData, phone: e.target.value })}
                    data-testid="input-edit-phone"
                  />
                </div>
                <div>
                  <Label>Mobile</Label>
                  <Input
                    value={editedData.mobile ?? showEditContact.contact.mobile ?? ''}
                    onChange={(e) => setEditedData({ ...editedData, mobile: e.target.value })}
                    data-testid="input-edit-mobile"
                  />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Admin Comment
                </Label>
                <Textarea
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder="Add a comment about this contact..."
                  data-testid="input-admin-comment"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditContact(null)}>Cancel</Button>
            <Button
              onClick={() => updateContactMutation.mutate(showEditContact.orderContact.id)}
              disabled={updateContactMutation.isPending}
              data-testid="button-save-contact"
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
