import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, Building2, FileText, Settings, Eye, UserPlus, Link as LinkIcon } from 'lucide-react';
import type { ClientAccount, VerificationCampaign } from '@shared/schema';

export default function ClientPortalAdmin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('clients');
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showGrantAccess, setShowGrantAccess] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [clientDetail, setClientDetail] = useState<any>(null);

  const { data: clients, isLoading: clientsLoading } = useQuery<ClientAccount[]>({
    queryKey: ['/api/client-portal/admin/clients'],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/client-portal/admin/orders'],
  });

  const { data: campaigns } = useQuery<VerificationCampaign[]>({
    queryKey: ['/api/verification-campaigns'],
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: { name: string; companyName?: string; contactEmail?: string; contactPhone?: string }) => {
      return apiRequest('POST', '/api/client-portal/admin/clients', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-portal/admin/clients'] });
      setShowCreateClient(false);
      toast({ title: 'Client created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create client', variant: 'destructive' });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${selectedClient?.id}/users`, data);
    },
    onSuccess: () => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      setShowCreateUser(false);
      toast({ title: 'User created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create user', variant: 'destructive' });
    },
  });

  const grantAccessMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${selectedClient?.id}/campaigns`, { campaignId });
    },
    onSuccess: () => {
      if (selectedClient) {
        fetchClientDetail(selectedClient.id);
      }
      setShowGrantAccess(false);
      toast({ title: 'Campaign access granted' });
    },
    onError: () => {
      toast({ title: 'Failed to grant access', variant: 'destructive' });
    },
  });

  const fetchClientDetail = async (clientId: string) => {
    const response = await fetch(`/api/client-portal/admin/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    const data = await response.json();
    setClientDetail(data);
  };

  const handleClientClick = async (client: ClientAccount) => {
    setSelectedClient(client);
    await fetchClientDetail(client.id);
  };

  const handleCreateClient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createClientMutation.mutate({
      name: formData.get('name') as string,
      companyName: formData.get('companyName') as string,
      contactEmail: formData.get('contactEmail') as string,
      contactPhone: formData.get('contactPhone') as string,
    });
  };

  const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createUserMutation.mutate({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Client Portal Management
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Manage client accounts, users, campaign access, and monthly orders
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="clients" data-testid="tab-clients">
            <Building2 className="h-4 w-4 mr-2" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <FileText className="h-4 w-4 mr-2" />
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Client Accounts</CardTitle>
                <Button size="sm" onClick={() => setShowCreateClient(true)} data-testid="button-create-client">
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : clients && clients.length > 0 ? (
                  <div className="space-y-2">
                    {clients.map((client) => (
                      <div
                        key={client.id}
                        className={`p-3 border rounded-lg cursor-pointer hover-elevate ${
                          selectedClient?.id === client.id ? 'border-primary bg-accent' : ''
                        }`}
                        onClick={() => handleClientClick(client)}
                        data-testid={`client-row-${client.id}`}
                      >
                        <div className="font-medium">{client.name}</div>
                        {client.companyName && (
                          <div className="text-sm text-muted-foreground">{client.companyName}</div>
                        )}
                        <Badge variant={client.isActive ? 'default' : 'secondary'} className="mt-1">
                          {client.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No clients yet</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedClient ? selectedClient.name : 'Select a Client'}
                </CardTitle>
                {selectedClient && (
                  <CardDescription>{selectedClient.contactEmail}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {selectedClient && clientDetail ? (
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Users
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateUser(true)} data-testid="button-add-user">
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add User
                        </Button>
                      </div>
                      {clientDetail.users && clientDetail.users.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientDetail.users.map((user: any) => (
                              <TableRow key={user.id}>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>{user.firstName} {user.lastName}</TableCell>
                                <TableCell>
                                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                                    {user.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm">No users yet</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          Campaign Access
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowGrantAccess(true)} data-testid="button-grant-access">
                          <Plus className="h-4 w-4 mr-1" />
                          Grant Access
                        </Button>
                      </div>
                      {clientDetail.campaigns && clientDetail.campaigns.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Campaign</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientDetail.campaigns.map((access: any) => (
                              <TableRow key={access.id}>
                                <TableCell>{access.campaign.name}</TableCell>
                                <TableCell>
                                  <Badge variant={access.campaign.status === 'active' ? 'default' : 'secondary'}>
                                    {access.campaign.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm">No campaigns assigned</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Select a client to view details
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Client Orders</CardTitle>
              <CardDescription>Pending and recent orders from clients</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <p className="text-muted-foreground">Loading orders...</p>
              ) : orders && orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((item: any) => (
                      <TableRow key={item.order.id} data-testid={`order-row-${item.order.id}`}>
                        <TableCell className="font-mono text-sm">{item.order.orderNumber}</TableCell>
                        <TableCell>{item.client.name}</TableCell>
                        <TableCell>{item.campaign.name}</TableCell>
                        <TableCell>{item.order.requestedQuantity}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.order.status === 'submitted' ? 'default' :
                              item.order.status === 'approved' ? 'default' :
                              item.order.status === 'completed' ? 'secondary' :
                              item.order.status === 'rejected' ? 'destructive' :
                              'outline'
                            }
                          >
                            {item.order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/client-portal/orders/${item.order.id}`)}
                            data-testid={`button-view-order-${item.order.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">No orders yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateClient} onOpenChange={setShowCreateClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Client Account</DialogTitle>
            <DialogDescription>Add a new client to the portal</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateClient}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Client Name</Label>
                <Input id="name" name="name" required data-testid="input-client-name" />
              </div>
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" name="companyName" data-testid="input-company-name" />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input id="contactEmail" name="contactEmail" type="email" data-testid="input-contact-email" />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input id="contactPhone" name="contactPhone" data-testid="input-contact-phone" />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreateClient(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClientMutation.isPending} data-testid="button-submit-client">
                {createClientMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {selectedClient?.name}</DialogTitle>
            <DialogDescription>Create a login for this client</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required data-testid="input-user-email" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required data-testid="input-user-password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" data-testid="input-first-name" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" data-testid="input-last-name" />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-user">
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showGrantAccess} onOpenChange={setShowGrantAccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Campaign Access</DialogTitle>
            <DialogDescription>Select a campaign to grant access to {selectedClient?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={(value) => grantAccessMutation.mutate(value)}>
              <SelectTrigger data-testid="select-campaign">
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGrantAccess(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
