import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Building2, LogOut, Package, Plus, FileText, Users, Calendar, ChevronRight } from 'lucide-react';

interface ClientUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  clientAccountId: string;
  clientAccountName: string;
}

interface Campaign {
  id: string;
  name: string;
  eligibleCount: number;
}

interface Order {
  id: string;
  orderNumber: string;
  campaignId: string;
  campaignName: string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  deliveredQuantity: number;
  status: string;
  orderMonth: number;
  orderYear: number;
  createdAt: string;
}

export default function ClientPortalDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [orderQuantity, setOrderQuantity] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('clientPortalUser');
    if (!storedUser) {
      setLocation('/client-portal/login');
      return;
    }
    setUser(JSON.parse(storedUser));
    fetchData();
  }, []);

  const getToken = () => localStorage.getItem('clientPortalToken');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [campaignsRes, ordersRes] = await Promise.all([
        fetch('/api/client-portal/campaigns', {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
        fetch('/api/client-portal/orders', {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);

      if (!campaignsRes.ok || !ordersRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const campaignsData = await campaignsRes.json();
      const ordersData = await ordersRes.json();
      setCampaigns(campaignsData);
      setOrders(ordersData);
    } catch (error) {
      toast({ title: 'Failed to load data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalUser');
    setLocation('/client-portal/login');
  };

  const handleSubmitOrder = async () => {
    if (!selectedCampaign || !orderQuantity) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const response = await fetch('/api/client-portal/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          campaignId: selectedCampaign,
          requestedQuantity: parseInt(orderQuantity),
          clientNotes: orderNotes,
          orderMonth: now.getMonth() + 1,
          orderYear: now.getFullYear(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      toast({ title: 'Order submitted successfully' });
      setShowNewOrder(false);
      setSelectedCampaign('');
      setOrderQuantity('');
      setOrderNotes('');
      fetchData();
    } catch (error) {
      toast({ title: 'Failed to submit order', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="default">Pending Approval</Badge>;
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-semibold">Client Portal</span>
            {user && (
              <span className="text-sm text-muted-foreground">| {user.clientAccountName}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.firstName} {user?.lastName}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {user?.firstName}</h1>
            <p className="text-muted-foreground">Manage your contact orders</p>
          </div>
          <Button onClick={() => setShowNewOrder(true)} data-testid="button-new-order">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Available Campaigns</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaigns.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Eligible Contacts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {campaigns.reduce((sum, c) => sum + (c.eligibleCount || 0), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter((o) => o.status === 'submitted' || o.status === 'approved').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Campaigns</CardTitle>
            <CardDescription>Verification campaigns you have access to</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No campaigns assigned yet</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} className="hover-elevate cursor-pointer" onClick={() => {
                    setSelectedCampaign(campaign.id);
                    setShowNewOrder(true);
                  }} data-testid={`campaign-card-${campaign.id}`}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {campaign.eligibleCount?.toLocaleString() || 0} eligible contacts
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
            <CardDescription>Your contact orders and their status</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No orders yet</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id} data-testid={`order-row-${order.id}`}>
                        <TableCell className="font-mono">{order.orderNumber}</TableCell>
                        <TableCell>{order.campaignName}</TableCell>
                        <TableCell>{order.orderMonth}/{order.orderYear}</TableCell>
                        <TableCell>{order.requestedQuantity}</TableCell>
                        <TableCell>{order.deliveredQuantity}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showNewOrder} onOpenChange={setShowNewOrder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit New Order</DialogTitle>
            <DialogDescription>
              Request contacts from your available campaigns
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger data-testid="select-campaign">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name} ({campaign.eligibleCount?.toLocaleString() || 0} eligible)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                placeholder="Number of contacts"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(e.target.value)}
                data-testid="input-quantity"
              />
              {selectedCampaign && (
                <p className="text-sm text-muted-foreground mt-1">
                  Available: {campaigns.find(c => c.id === selectedCampaign)?.eligibleCount?.toLocaleString() || 0}
                </p>
              )}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any special requirements..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOrder(false)}>Cancel</Button>
            <Button onClick={handleSubmitOrder} disabled={isSubmitting} data-testid="button-submit-order">
              {isSubmitting ? 'Submitting...' : 'Submit Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
