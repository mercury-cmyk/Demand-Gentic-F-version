import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import {
  Building2, LogOut, Package, Plus, FileText, Users, Calendar, ChevronRight,
  LayoutDashboard, Target, BarChart3, Download, CreditCard, MessageSquare,
  Phone, Mail, Send, Clock, CheckCircle, AlertCircle, TrendingUp, TrendingDown,
  FileDown, Eye, Headphones, Loader2, ArrowUpRight, ArrowDownRight, Sparkles,
  Megaphone, UserCheck, DollarSign, Receipt, HelpCircle, Settings, Bell,
  ChevronDown, Filter, Search, RefreshCw, ExternalLink, Zap, Bot
} from 'lucide-react';
import { ClientAgentButton } from '@/components/client-portal/agent/client-agent-chat';

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
  status: string;
  eligibleCount: number;
  totalContacts: number;
  verifiedCount: number;
  deliveredCount: number;
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

interface Invoice {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
  pdfUrl: string | null;
}

interface CostSummary {
  totalCost: number;
  monthlyTrend: { month: string; cost: number }[];
  byType: { type: string; total: number; count: number }[];
}

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  lastReplyAt: string | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  sent: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  paused: 'bg-gray-100 text-gray-600',
};

export default function ClientPortalDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [orderQuantity, setOrderQuantity] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('clientPortalUser');
    if (!storedUser) {
      setLocation('/client-portal/login');
      return;
    }
    setUser(JSON.parse(storedUser));
  }, []);

  const getToken = () => localStorage.getItem('clientPortalToken');

  const authHeaders = {
    headers: { Authorization: `Bearer ${getToken()}` },
  };

  // Queries
  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ['client-portal-campaigns'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery<Order[]>({
    queryKey: ['client-portal-orders'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/orders', authHeaders);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['client-portal-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/invoices', authHeaders);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: costSummary } = useQuery<CostSummary>({
    queryKey: ['client-portal-costs'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/summary', authHeaders);
      if (!res.ok) return { totalCost: 0, monthlyTrend: [], byType: [] };
      return res.json();
    },
    enabled: !!user,
  });

  // Mutations
  const submitOrderMutation = useMutation({
    mutationFn: async (data: { campaignId: string; requestedQuantity: number; clientNotes: string }) => {
      const now = new Date();
      const res = await fetch('/api/client-portal/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          ...data,
          orderMonth: now.getMonth() + 1,
          orderYear: now.getFullYear(),
        }),
      });
      if (!res.ok) throw new Error('Failed to submit order');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Order submitted successfully' });
      setShowNewOrder(false);
      setSelectedCampaign('');
      setOrderQuantity('');
      setOrderNotes('');
      refetchOrders();
    },
    onError: () => {
      toast({ title: 'Failed to submit order', variant: 'destructive' });
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('clientPortalToken');
    localStorage.removeItem('clientPortalUser');
    setLocation('/client-portal/login');
  };

  const handleSubmitOrder = () => {
    if (!selectedCampaign || !orderQuantity) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    submitOrderMutation.mutate({
      campaignId: selectedCampaign,
      requestedQuantity: parseInt(orderQuantity),
      clientNotes: orderNotes,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge className={statusColors[status] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Calculate metrics
  const totalLeadsDelivered = campaigns.reduce((sum, c) => sum + (c.deliveredCount || 0), 0);
  const totalEligible = campaigns.reduce((sum, c) => sum + (c.eligibleCount || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pendingOrders = orders.filter(o => o.status === 'submitted' || o.status === 'approved').length;
  const totalSpent = costSummary?.totalCost || 0;
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.totalAmount - i.amountPaid, 0);

  // Mock data for charts (will be replaced with real data)
  const deliveryTrendData = [
    { month: 'Jan', leads: 120, verified: 95 },
    { month: 'Feb', leads: 180, verified: 150 },
    { month: 'Mar', leads: 250, verified: 210 },
    { month: 'Apr', leads: 320, verified: 280 },
    { month: 'May', leads: 280, verified: 240 },
    { month: 'Jun', leads: 350, verified: 310 },
  ];

  const campaignPerformance = campaigns.slice(0, 5).map((c, i) => ({
    name: c.name.length > 20 ? c.name.substring(0, 20) + '...' : c.name,
    delivered: c.deliveredCount || 0,
    verified: c.verifiedCount || 0,
  }));

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Campaigns', icon: Target },
    { id: 'leads', label: 'Leads & Delivery', icon: UserCheck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'support', label: 'Support', icon: Headphones },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-lg leading-none">Client Portal</h1>
                  <p className="text-xs text-muted-foreground">{user.clientAccountName}</p>
                </div>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(item.id)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium leading-none">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden border-t overflow-x-auto">
          <div className="flex px-4 py-2 gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(item.id)}
                className="gap-1 shrink-0"
              >
                <item.icon className="h-4 w-4" />
                <span className="text-xs">{item.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Welcome back, {user.firstName}!</h2>
                  <p className="text-blue-100 mt-1">Here's what's happening with your campaigns today.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowNewOrder(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Order
                  </Button>
                  <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setActiveTab('support')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Contact Team
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Campaigns</p>
                      <p className="text-3xl font-bold mt-1">{activeCampaigns}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {campaigns.length} total campaigns
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Target className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Leads Delivered</p>
                      <p className="text-3xl font-bold mt-1">{totalLeadsDelivered.toLocaleString()}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                        <span className="text-xs text-green-600">+12% this month</span>
                      </div>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <UserCheck className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Orders</p>
                      <p className="text-3xl font-bold mt-1">{pendingOrders}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {orders.length} total orders
                      </p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Package className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                      <p className="text-3xl font-bold mt-1">{formatCurrency(totalSpent)}</p>
                      {unpaidInvoices > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          {formatCurrency(unpaidInvoices)} pending
                        </p>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lead Delivery Trend</CardTitle>
                  <CardDescription>Monthly leads and verification stats</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={deliveryTrendData}>
                        <defs>
                          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#colorLeads)" name="Leads" />
                        <Area type="monotone" dataKey="verified" stroke="#10b981" fill="url(#colorVerified)" name="Verified" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Campaign Performance</CardTitle>
                  <CardDescription>Top campaigns by delivery</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={campaignPerformance} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis dataKey="name" type="category" className="text-xs" width={100} />
                        <Tooltip />
                        <Bar dataKey="delivered" fill="#3b82f6" name="Delivered" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Recent Orders</CardTitle>
                    <CardDescription>Your latest contact orders</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('leads')}>
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>No orders yet</p>
                      <Button variant="link" onClick={() => setShowNewOrder(true)}>
                        Create your first order
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.slice(0, 5).map((order) => (
                        <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <Package className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground">{order.campaignName}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(order.status)}
                            <p className="text-xs text-muted-foreground mt-1">
                              {order.deliveredQuantity}/{order.requestedQuantity} delivered
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Your Campaigns</CardTitle>
                    <CardDescription>Quick access to campaigns</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('campaigns')}>
                    View All <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {campaigns.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>No campaigns assigned yet</p>
                      <p className="text-sm">Contact your account manager</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {campaigns.slice(0, 5).map((campaign) => (
                        <div
                          key={campaign.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedCampaign(campaign.id);
                            setShowNewOrder(true);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <Target className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{campaign.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {campaign.eligibleCount?.toLocaleString() || 0} eligible
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ==================== CAMPAIGNS TAB ==================== */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Campaigns</h2>
                <p className="text-muted-foreground">Manage your verification campaigns and request new ones</p>
              </div>
              <Button onClick={() => setShowNewCampaign(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Request New Campaign
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className="hover:shadow-md transition-all cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Target className="h-5 w-5 text-white" />
                      </div>
                      {getStatusBadge(campaign.status || 'active')}
                    </div>
                    <CardTitle className="mt-3 group-hover:text-primary transition-colors">
                      {campaign.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Eligible</p>
                        <p className="font-semibold">{(campaign.eligibleCount || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Delivered</p>
                        <p className="font-semibold">{(campaign.deliveredCount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {campaign.eligibleCount > 0 && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Delivery Progress</span>
                          <span>{Math.round(((campaign.deliveredCount || 0) / campaign.eligibleCount) * 100)}%</span>
                        </div>
                        <Progress value={((campaign.deliveredCount || 0) / campaign.eligibleCount) * 100} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelectedCampaign(campaign.id);
                        setShowNewOrder(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Order Leads
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>

            {campaigns.length === 0 && (
              <Card className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Campaigns Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Request a new campaign or contact your account manager to get started.
                </p>
                <Button onClick={() => setShowNewCampaign(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Request Campaign
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* ==================== LEADS TAB ==================== */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Leads & Delivery</h2>
                <p className="text-muted-foreground">View and download your delivered contacts</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => refetchOrders()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button onClick={() => setShowNewOrder(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{orders.length}</p>
                      <p className="text-xs text-muted-foreground">Total Orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{pendingOrders}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{orders.filter(o => o.status === 'completed').length}</p>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <UserCheck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{orders.reduce((sum, o) => sum + o.deliveredQuantity, 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Leads Delivered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle>Order History</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">No Orders Yet</h3>
                    <p className="text-muted-foreground mb-4">Start by creating your first order</p>
                    <Button onClick={() => setShowNewOrder(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Order
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Campaign</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Requested</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((order) => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                            <TableCell>{order.campaignName}</TableCell>
                            <TableCell>{order.orderMonth}/{order.orderYear}</TableCell>
                            <TableCell className="text-right">{order.requestedQuantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{order.deliveredQuantity.toLocaleString()}</TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="text-right">
                              {order.status === 'completed' && order.deliveredQuantity > 0 && (
                                <Button variant="ghost" size="sm">
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== REPORTS TAB ==================== */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Reports & Analytics</h2>
                <p className="text-muted-foreground">Track your campaign performance and ROI</p>
              </div>
              <div className="flex gap-2">
                <Select defaultValue="30d">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="1y">Last year</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline">
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Report
                </Button>
              </div>
            </div>

            {/* Report Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Leads</p>
                      <p className="text-2xl font-bold">{totalLeadsDelivered.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowUpRight className="h-4 w-4" />
                      +12%
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Verified Rate</p>
                      <p className="text-2xl font-bold">87.5%</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowUpRight className="h-4 w-4" />
                      +3%
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Cost per Lead</p>
                      <p className="text-2xl font-bold">$142</p>
                    </div>
                    <div className="flex items-center text-red-600 text-sm">
                      <ArrowDownRight className="h-4 w-4" />
                      -5%
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Delivery Time</p>
                      <p className="text-2xl font-bold">2.3 days</p>
                    </div>
                    <div className="flex items-center text-green-600 text-sm">
                      <ArrowDownRight className="h-4 w-4" />
                      -18%
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Lead Delivery</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={deliveryTrendData}>
                        <defs>
                          <linearGradient id="colorLeads2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#colorLeads2)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cost Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={costSummary?.byType?.map((t, i) => ({ name: t.type, value: t.total })) || [
                            { name: 'Leads', value: 4500 },
                            { name: 'Verification', value: 1200 },
                            { name: 'AI Calls', value: 800 },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {(costSummary?.byType || [{ name: 'Leads' }, { name: 'Verification' }, { name: 'AI Calls' }]).map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value as number)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ==================== BILLING TAB ==================== */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Billing & Invoices</h2>
                <p className="text-muted-foreground">View your invoices and payment history</p>
              </div>
            </div>

            {/* Billing Summary */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Billing Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
                      <p className="text-sm text-muted-foreground">Total Spent</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-2xl font-bold">{invoices.length}</p>
                      <p className="text-sm text-muted-foreground">Total Invoices</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                      <p className="text-2xl font-bold text-amber-600">{formatCurrency(unpaidInvoices)}</p>
                      <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">Wire Transfer</p>
                        <p className="text-xs text-muted-foreground">NET 30</p>
                      </div>
                    </div>
                    <Badge variant="outline">Default</Badge>
                  </div>
                  <Button variant="outline" className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Payment Method
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Invoices Table */}
            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">No Invoices Yet</h3>
                    <p className="text-muted-foreground">Your invoices will appear here once generated</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                            <TableCell>
                              {new Date(invoice.billingPeriodStart).toLocaleDateString()} - {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(invoice.totalAmount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(invoice.amountPaid)}</TableCell>
                            <TableCell>
                              {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== SUPPORT TAB ==================== */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Support & Contact</h2>
                <p className="text-muted-foreground">Get help from our team</p>
              </div>
              <Button onClick={() => setShowSupportDialog(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                New Support Request
              </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Contact Cards */}
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                    <Mail className="h-7 w-7 text-blue-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Email Support</h3>
                  <p className="text-sm text-muted-foreground mb-4">Get help via email. We typically respond within 2-4 hours.</p>
                  <Button variant="outline" className="w-full" asChild>
                    <a href="mailto:support@pivotal-b2b.com">
                      support@pivotal-b2b.com
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                    <Phone className="h-7 w-7 text-green-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Phone Support</h3>
                  <p className="text-sm text-muted-foreground mb-4">Speak directly with your account manager during business hours.</p>
                  <Button variant="outline" className="w-full" asChild>
                    <a href="tel:+1-555-123-4567">
                      +1 (555) 123-4567
                    </a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
                    <Headphones className="h-7 w-7 text-purple-600" />
                  </div>
                  <h3 className="font-semibold mb-2">Schedule a Call</h3>
                  <p className="text-sm text-muted-foreground mb-4">Book a call with your dedicated account manager.</p>
                  <Button variant="outline" className="w-full">
                    Schedule Meeting
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Account Manager */}
            <Card>
              <CardHeader>
                <CardTitle>Your Account Team</CardTitle>
                <CardDescription>Your dedicated support contacts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">ZM</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">Zahid Mahmood</p>
                      <p className="text-sm text-muted-foreground">Account Manager</p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href="mailto:zahid.m@pivotal-b2b.com">
                            <Mail className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-green-100 text-green-700">TS</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">Technical Support</p>
                      <p className="text-sm text-muted-foreground">Data & Integration Help</p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href="mailto:tech@pivotal-b2b.com">
                            <Mail className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { q: 'How do I download my delivered leads?', a: 'Go to Leads & Delivery tab, find your completed order, and click the download button.' },
                  { q: 'What is the typical delivery time?', a: 'Most orders are delivered within 2-5 business days depending on volume and campaign complexity.' },
                  { q: 'How are leads verified?', a: 'Our AI-powered verification system validates contact information through multiple data sources and real-time validation.' },
                  { q: 'Can I request a custom campaign?', a: 'Yes! Go to Campaigns tab and click "Request New Campaign" to submit your requirements.' },
                ].map((faq, i) => (
                  <div key={i} className="p-4 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">{faq.q}</p>
                        <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* ==================== DIALOGS ==================== */}

      {/* New Order Dialog */}
      <Dialog open={showNewOrder} onOpenChange={setShowNewOrder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit New Order</DialogTitle>
            <DialogDescription>
              Request verified contacts from your available campaigns
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign</Label>
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger>
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
                placeholder="Any special requirements or targeting criteria..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewOrder(false)}>Cancel</Button>
            <Button onClick={handleSubmitOrder} disabled={submitOrderMutation.isPending}>
              {submitOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Campaign Request Dialog */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request New Campaign</DialogTitle>
            <DialogDescription>
              Tell us about the campaign you need and we'll set it up for you
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign Name</Label>
              <Input placeholder="e.g., Q1 2026 IT Decision Makers" />
            </div>
            <div>
              <Label>Target Audience</Label>
              <Textarea placeholder="Describe your ideal customer profile (job titles, industries, company size, geography, etc.)" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estimated Volume</Label>
                <Input type="number" placeholder="e.g., 5000" />
              </div>
              <div>
                <Label>Timeline</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asap">ASAP</SelectItem>
                    <SelectItem value="1week">Within 1 week</SelectItem>
                    <SelectItem value="2weeks">Within 2 weeks</SelectItem>
                    <SelectItem value="1month">Within 1 month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Additional Requirements</Label>
              <Textarea placeholder="Any specific data fields, verification requirements, or other notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({ title: 'Campaign request submitted! Our team will contact you shortly.' });
              setShowNewCampaign(false);
            }}>
              <Send className="h-4 w-4 mr-2" />
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Support Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Support Request</DialogTitle>
            <DialogDescription>
              Describe your issue and we'll get back to you as soon as possible
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input placeholder="Brief description of your issue" />
            </div>
            <div>
              <Label>Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billing">Billing & Payments</SelectItem>
                  <SelectItem value="delivery">Lead Delivery</SelectItem>
                  <SelectItem value="quality">Data Quality</SelectItem>
                  <SelectItem value="technical">Technical Issue</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Provide details about your issue..." rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupportDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              toast({ title: 'Support request submitted! We\'ll respond within 24 hours.' });
              setShowSupportDialog(false);
            }}>
              <Send className="h-4 w-4 mr-2" />
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Agent Button - Floating assistant */}
      <ClientAgentButton onNavigate={setActiveTab} />
    </div>
  );
}
