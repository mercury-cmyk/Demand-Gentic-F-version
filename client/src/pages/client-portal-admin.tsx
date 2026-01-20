import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Users,
  Building2,
  FileText,
  Settings,
  Eye,
  UserPlus,
  Link as LinkIcon,
  DollarSign,
  CreditCard,
  Send,
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { ClientAccount, VerificationCampaign } from '@shared/schema';

interface BillingConfig {
  clientAccountId: string;
  defaultBillingModel: string;
  defaultRatePerLead: string;
  defaultRatePerContact: string;
  defaultRatePerCallMinute: string;
  defaultRatePerEmail: string;
  monthlyRetainerAmount: string | null;
  retainerIncludesLeads: number | null;
  overageRatePerLead: string | null;
  paymentTermsDays: number;
  currency: string;
  billingEmail: string | null;
  taxExempt: boolean;
  taxId: string | null;
  taxRate: string;
  autoInvoiceEnabled: boolean;
  invoiceDayOfMonth: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientAccountId: string;
  clientName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  void: 'bg-gray-100 text-gray-600',
};

export default function ClientPortalAdmin() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('clients');
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showGrantAccess, setShowGrantAccess] = useState(false);
  const [showBillingConfig, setShowBillingConfig] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [clientDetail, setClientDetail] = useState<any>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);

  // Queries
  const { data: clients, isLoading: clientsLoading } = useQuery<ClientAccount[]>({
    queryKey: ['/api/client-portal/admin/clients'],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/client-portal/admin/orders'],
  });

  const { data: campaigns } = useQuery<VerificationCampaign[]>({
    queryKey: ['/api/verification-campaigns'],
  });

  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ['/api/client-portal/admin/invoices'],
  });

  // Mutations
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

  const updateBillingMutation = useMutation({
    mutationFn: async (data: Partial<BillingConfig>) => {
      return apiRequest('PUT', `/api/client-portal/admin/clients/${selectedClient?.id}/billing`, data);
    },
    onSuccess: () => {
      toast({ title: 'Billing configuration saved' });
      setShowBillingConfig(false);
    },
    onError: () => {
      toast({ title: 'Failed to save billing configuration', variant: 'destructive' });
    },
  });

  const updateInvoiceStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: string }) => {
      return apiRequest('PATCH', `/api/client-portal/admin/invoices/${invoiceId}/status`, { status });
    },
    onSuccess: () => {
      refetchInvoices();
      toast({ title: 'Invoice status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update invoice', variant: 'destructive' });
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (data: { clientId: string; periodStart: string; periodEnd: string }) => {
      return apiRequest('POST', `/api/client-portal/admin/clients/${data.clientId}/generate-invoice`, {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      });
    },
    onSuccess: () => {
      refetchInvoices();
      setShowCreateInvoice(false);
      toast({ title: 'Invoice generated successfully' });
    },
    onError: (error: any) => {
      toast({ title: error.message || 'Failed to generate invoice', variant: 'destructive' });
    },
  });

  const fetchClientDetail = async (clientId: string) => {
    const response = await fetch(`/api/client-portal/admin/clients/${clientId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    const data = await response.json();
    setClientDetail(data);
  };

  const fetchBillingConfig = async (clientId: string) => {
    const response = await fetch(`/api/client-portal/admin/clients/${clientId}/billing`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    });
    const data = await response.json();
    setBillingConfig(data);
  };

  const handleClientClick = async (client: ClientAccount) => {
    setSelectedClient(client);
    await fetchClientDetail(client.id);
  };

  const handleOpenBillingConfig = async () => {
    if (selectedClient) {
      await fetchBillingConfig(selectedClient.id);
      setShowBillingConfig(true);
    }
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

  const handleSaveBillingConfig = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateBillingMutation.mutate({
      defaultBillingModel: formData.get('billingModel') as any,
      defaultRatePerLead: parseFloat(formData.get('ratePerLead') as string),
      defaultRatePerContact: parseFloat(formData.get('ratePerContact') as string),
      defaultRatePerCallMinute: parseFloat(formData.get('ratePerCallMinute') as string),
      paymentTermsDays: parseInt(formData.get('paymentTerms') as string),
      billingEmail: formData.get('billingEmail') as string,
      taxExempt: formData.get('taxExempt') === 'on',
      taxRate: parseFloat(formData.get('taxRate') as string) / 100,
      autoInvoiceEnabled: formData.get('autoInvoice') === 'on',
    });
  };

  const handleGenerateInvoice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    generateInvoiceMutation.mutate({
      clientId: formData.get('clientId') as string,
      periodStart: formData.get('periodStart') as string,
      periodEnd: formData.get('periodEnd') as string,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Portal Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage client accounts, users, billing, and invoices
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="clients">
            <Building2 className="h-4 w-4 mr-2" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="orders">
            <FileText className="h-4 w-4 mr-2" />
            Requests
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <CreditCard className="h-4 w-4 mr-2" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* ==================== CLIENTS TAB ==================== */}
        <TabsContent value="clients" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Client List */}
            <Card className="lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-lg">Client Organizations</CardTitle>
                <Button size="sm" onClick={() => setShowCreateClient(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  {clientsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : clients && clients.length > 0 ? (
                    <div className="space-y-2">
                      {clients.map((client) => (
                        <div
                          key={client.id}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent ${
                            selectedClient?.id === client.id ? 'border-primary bg-accent' : ''
                          }`}
                          onClick={() => handleClientClick(client)}
                        >
                          <div className="font-medium">{client.name}</div>
                          {client.companyName && (
                            <div className="text-sm text-muted-foreground">{client.companyName}</div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={client.isActive ? 'default' : 'secondary'}>
                              {client.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No clients yet</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Client Detail */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {selectedClient ? selectedClient.name : 'Select a Client'}
                    </CardTitle>
                    {selectedClient && (
                      <CardDescription>{selectedClient.contactEmail}</CardDescription>
                    )}
                  </div>
                  {selectedClient && (
                    <Button variant="outline" size="sm" onClick={handleOpenBillingConfig}>
                      <DollarSign className="h-4 w-4 mr-1" />
                      Billing Config
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedClient && clientDetail ? (
                  <div className="space-y-6">
                    {/* Users Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          User Accounts
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowCreateUser(true)}>
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
                              <TableHead>Last Login</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientDetail.users.map((user: any) => (
                              <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.email}</TableCell>
                                <TableCell>
                                  {user.firstName} {user.lastName}
                                </TableCell>
                                <TableCell>
                                  {user.lastLoginAt
                                    ? new Date(user.lastLoginAt).toLocaleDateString()
                                    : 'Never'}
                                </TableCell>
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
                        <p className="text-muted-foreground text-sm py-4 text-center border rounded-lg">
                          No users yet. Add a user to enable client portal access.
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Campaign Access Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <LinkIcon className="h-4 w-4" />
                          Campaign Access
                        </h3>
                        <Button size="sm" variant="outline" onClick={() => setShowGrantAccess(true)}>
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
                              <TableHead>Granted</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {clientDetail.campaigns.map((access: any) => (
                              <TableRow key={access.id}>
                                <TableCell className="font-medium">{access.campaign.name}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      access.campaign.status === 'active' ? 'default' : 'secondary'
                                    }
                                  >
                                    {access.campaign.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {new Date(access.createdAt).toLocaleDateString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-sm py-4 text-center border rounded-lg">
                          No campaigns assigned. Grant access to campaigns for this client.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-12">
                    Select a client to view and manage their details
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== ORDERS TAB ==================== */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Requests</CardTitle>
              <CardDescription>Pending and recent campaign requests from clients</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : orders && orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Campaign Name</TableHead>
                      <TableHead>Requested Leads</TableHead>
                      <TableHead>CPL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((item: any) => (
                      <TableRow key={item.order.id}>
                        <TableCell className="font-mono text-sm">
                          {item.order.orderNumber}
                        </TableCell>
                        <TableCell>{item.client.name}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.campaign.name}</span>
                            {item.order.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {item.order.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{item.order.requestedQuantity || '-'}</TableCell>
                        <TableCell>
                          {item.order.ratePerLead ? `$${item.order.ratePerLead}` : <span className="text-muted-foreground">Not set</span>}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              item.order.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : item.order.status === 'active'
                                ? 'bg-blue-100 text-blue-800'
                                : item.order.status === 'approved'
                                ? 'bg-purple-100 text-purple-800'
                                : item.order.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {item.order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.order.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setLocation(`/client-portal/orders/${item.order.id}`)
                            }
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
                <p className="text-muted-foreground text-center py-8">No campaign requests yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== INVOICES TAB ==================== */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>Manage client invoices and payments</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetchInvoices()}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setShowCreateInvoice(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Generate Invoice
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-mono text-sm">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell>{invoice.clientName}</TableCell>
                        <TableCell>
                          {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                          {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(invoice.totalAmount)}
                        </TableCell>
                        <TableCell>{formatCurrency(invoice.amountPaid)}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[invoice.status]}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString()
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {invoice.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'sent',
                                  })
                                }
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            {invoice.status === 'sent' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateInvoiceStatusMutation.mutate({
                                    invoiceId: invoice.id,
                                    status: 'paid',
                                  })
                                }
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {invoice.pdfUrl && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={invoice.pdfUrl} target="_blank" rel="noopener">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No invoices yet</p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() => setShowCreateInvoice(true)}
                  >
                    Generate First Invoice
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== SETTINGS TAB ==================== */}
        <TabsContent value="settings">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Default Pricing</CardTitle>
                <CardDescription>
                  Set default rates for new clients. These can be overridden per client.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Rate per Lead</Label>
                    <Input type="number" defaultValue="150" disabled />
                  </div>
                  <div>
                    <Label>Rate per Contact</Label>
                    <Input type="number" defaultValue="25" disabled />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Configure per-client rates in the client billing settings.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto-Invoice Settings</CardTitle>
                <CardDescription>Configure automatic monthly invoice generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Auto-Invoicing</Label>
                  <Switch defaultChecked />
                </div>
                <div>
                  <Label>Invoice Day of Month</Label>
                  <Select defaultValue="1">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 5, 10, 15, 20, 25].map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          Day {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* Create Client Dialog */}
      <Dialog open={showCreateClient} onOpenChange={setShowCreateClient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Client Organization</DialogTitle>
            <DialogDescription>Add a new client to the portal</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateClient}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Organization Name *</Label>
                <Input id="name" name="name" required placeholder="Acme Corp" />
              </div>
              <div>
                <Label htmlFor="companyName">Legal Company Name</Label>
                <Input id="companyName" name="companyName" placeholder="Acme Corporation Inc." />
              </div>
              <div>
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <Input id="contactPhone" name="contactPhone" placeholder="+1 555 123 4567" />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateClient(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClientMutation.isPending}>
                {createClientMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Client
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {selectedClient?.name}</DialogTitle>
            <DialogDescription>Create a login account for client portal access</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required placeholder="user@client.com" />
              </div>
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input id="password" name="password" type="password" required minLength={8} />
                <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" placeholder="John" />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" placeholder="Doe" />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Grant Campaign Access Dialog */}
      <Dialog open={showGrantAccess} onOpenChange={setShowGrantAccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Campaign Access</DialogTitle>
            <DialogDescription>
              Select a campaign to grant access to {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={(value) => grantAccessMutation.mutate(value)}>
              <SelectTrigger>
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

      {/* Billing Configuration Dialog */}
      <Dialog open={showBillingConfig} onOpenChange={setShowBillingConfig}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Billing Configuration - {selectedClient?.name}</DialogTitle>
            <DialogDescription>Set pricing, payment terms, and invoicing settings</DialogDescription>
          </DialogHeader>
          {billingConfig && (
            <form onSubmit={handleSaveBillingConfig}>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-medium">Pricing</h4>
                  <div>
                    <Label htmlFor="billingModel">Billing Model</Label>
                    <Select name="billingModel" defaultValue={billingConfig.defaultBillingModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cpl">Cost Per Lead (CPL)</SelectItem>
                        <SelectItem value="cpc">Cost Per Contact (CPC)</SelectItem>
                        <SelectItem value="monthly_retainer">Monthly Retainer</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ratePerLead">Rate per Lead ($)</Label>
                    <Input
                      id="ratePerLead"
                      name="ratePerLead"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.defaultRatePerLead)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ratePerContact">Rate per Contact ($)</Label>
                    <Input
                      id="ratePerContact"
                      name="ratePerContact"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.defaultRatePerContact)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ratePerCallMinute">Rate per AI Call Minute ($)</Label>
                    <Input
                      id="ratePerCallMinute"
                      name="ratePerCallMinute"
                      type="number"
                      step="0.0001"
                      defaultValue={parseFloat(billingConfig.defaultRatePerCallMinute)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Payment & Tax</h4>
                  <div>
                    <Label htmlFor="paymentTerms">Payment Terms (days)</Label>
                    <Select name="paymentTerms" defaultValue={billingConfig.paymentTermsDays.toString()}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">NET 15</SelectItem>
                        <SelectItem value="30">NET 30</SelectItem>
                        <SelectItem value="45">NET 45</SelectItem>
                        <SelectItem value="60">NET 60</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="billingEmail">Billing Email</Label>
                    <Input
                      id="billingEmail"
                      name="billingEmail"
                      type="email"
                      defaultValue={billingConfig.billingEmail || ''}
                      placeholder="billing@client.com"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="taxExempt">Tax Exempt</Label>
                    <Switch id="taxExempt" name="taxExempt" defaultChecked={billingConfig.taxExempt} />
                  </div>
                  <div>
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      name="taxRate"
                      type="number"
                      step="0.01"
                      defaultValue={parseFloat(billingConfig.taxRate) * 100}
                      disabled={billingConfig.taxExempt}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoInvoice">Auto-Generate Invoices</Label>
                    <Switch
                      id="autoInvoice"
                      name="autoInvoice"
                      defaultChecked={billingConfig.autoInvoiceEnabled}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setShowBillingConfig(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBillingMutation.isPending}>
                  {updateBillingMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Configuration
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice from uninvoiced activity costs
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGenerateInvoice}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="clientId">Client</Label>
                <Select name="clientId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="periodStart">Period Start</Label>
                  <Input id="periodStart" name="periodStart" type="date" required />
                </div>
                <div>
                  <Label htmlFor="periodEnd">Period End</Label>
                  <Input id="periodEnd" name="periodEnd" type="date" required />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowCreateInvoice(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateInvoiceMutation.isPending}>
                {generateInvoiceMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Generate Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
