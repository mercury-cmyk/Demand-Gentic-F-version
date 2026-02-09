import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  TrendingUp,
  FileText,
  ChevronRight,
  Loader2,
  Download,
  AlertCircle,
  Tag,
  Calendar,
  Clock,
  Banknote,
  Users,
  MousePointerClick,
  ClipboardCheck,
  Handshake,
  Sparkles,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const getToken = () => localStorage.getItem('clientPortalToken');

interface CostSummary {
  period: { start: string; end: string };
  totalCost: number;
  activityCount: number;
  uninvoicedTotal: number;
  uninvoicedCount: number;
  byType: Array<{ activityType: string; total: number; count: number }>;
  monthlyTrend: Array<{ month: string; total: number }>;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  currency: string;
  status: string;
  dueDate: string | null;
  paidDate: string | null;
  pdfUrl: string | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const activityTypeLabels: Record<string, string> = {
  lead_delivered: 'Leads Delivered',
  contact_verified: 'Contacts Verified',
  ai_call_minute: 'AI Call Minutes',
  email_sent: 'Emails Sent',
  retainer_fee: 'Retainer Fee',
  setup_fee: 'Setup Fee',
};

const ordinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  void: 'bg-gray-100 text-gray-600',
};

export default function ClientPortalBilling() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: costSummary, isLoading: loadingCosts } = useQuery<CostSummary>({
    queryKey: ['client-portal-costs-summary'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/costs/summary', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch costs');
      return res.json();
    },
  });

  const { data: invoices, isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ['client-portal-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/invoices', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json();
    },
  });

  const { data: billingConfig } = useQuery<{
    defaultBillingModel: string;
    paymentTermsDays: number;
    currency: string;
    invoiceDayOfMonth: number;
    paymentDueDayOfMonth: number | null;
  }>({
    queryKey: ['client-portal-billing-config'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/config', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch billing config');
      return res.json();
    },
  });

  const { data: campaignPricingData } = useQuery<{
    pricing: Record<string, {
      pricePerLead: number;
      minimumOrderSize: number;
      isEnabled: boolean;
      label: string;
    }>;
  }>({
    queryKey: ['client-portal-campaign-pricing'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/campaign-pricing', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaign pricing');
      return res.json();
    },
  });

  const { data: pricingDocsData } = useQuery<{
    documents: Array<{
      id: string;
      name: string;
      description: string | null;
      fileName: string;
      fileSize: number | null;
      createdAt: string;
    }>;
  }>({
    queryKey: ['client-portal-pricing-documents'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/pricing-documents', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch pricing documents');
      return res.json();
    },
  });

  const handlePricingDocDownload = async (docId: string) => {
    try {
      const res = await fetch(`/api/client-portal/billing/pricing-documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to get download URL');
      const { downloadUrl, fileName } = await res.json();
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const pendingInvoices = invoices?.filter((inv) => inv.status === 'sent') || [];
  const overdueInvoices = invoices?.filter((inv) => inv.status === 'overdue') || [];

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Billing & Costs</h1>
          <p className="text-muted-foreground">
            Track your spending and manage invoices
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingCosts ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(costSummary?.totalCost || 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {costSummary?.activityCount || 0} activities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uninvoiced</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loadingCosts ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  formatCurrency(costSummary?.uninvoicedTotal || 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {costSummary?.uninvoicedCount || 0} items pending
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingInvoices.length}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(
                  pendingInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0)
                )}{' '}
                due
              </p>
            </CardContent>
          </Card>

          <Card className={overdueInvoices.length > 0 ? 'border-red-200 bg-red-50/50' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle
                className={`h-4 w-4 ${
                  overdueInvoices.length > 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  overdueInvoices.length > 0 ? 'text-red-600' : ''
                }`}
              >
                {overdueInvoices.length}
              </div>
              {overdueInvoices.length > 0 && (
                <p className="text-xs text-red-600">
                  {formatCurrency(
                    overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0)
                  )}{' '}
                  overdue
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
            <TabsTrigger value="pricing">Pricing & Terms</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Monthly Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Spending Trend</CardTitle>
                  <CardDescription>Last 6 months</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingCosts ? (
                    <div className="h-[250px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={costSummary?.monthlyTrend || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Cost by Type Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Spending by Category</CardTitle>
                  <CardDescription>This month</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingCosts ? (
                    <div className="h-[250px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : costSummary?.byType?.length ? (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="50%" height={200}>
                        <PieChart>
                          <Pie
                            data={costSummary.byType}
                            dataKey="total"
                            nameKey="activityType"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                          >
                            {costSummary.byType.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {costSummary.byType.map((item, index) => (
                          <div key={item.activityType} className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm flex-1">
                              {activityTypeLabels[item.activityType] || item.activityType}
                            </span>
                            <span className="text-sm font-medium">
                              {formatCurrency(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      No spending data this month
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>All Invoices</CardTitle>
                <CardDescription>Your invoice history</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingInvoices ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : invoices?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4" />
                    <p>No invoices yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices?.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {invoice.invoiceNumber}
                          </TableCell>
                          <TableCell>
                            {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                            {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div>{formatCurrency(invoice.totalAmount)}</div>
                            {invoice.balanceDue > 0 && invoice.balanceDue < invoice.totalAmount && (
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(invoice.balanceDue)} remaining
                              </div>
                            )}
                          </TableCell>
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
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {invoice.pdfUrl && (
                                <Button variant="ghost" size="sm" asChild>
                                  <a
                                    href={invoice.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <Link href={`/client-portal/billing/invoices/${invoice.id}`}>
                                <Button variant="ghost" size="sm">
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cost Breakdown Tab */}
          <TabsContent value="breakdown">
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown by Type</CardTitle>
                <CardDescription>Detailed view of your spending</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCosts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : costSummary?.byType?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mb-4" />
                    <p>No costs recorded yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costSummary?.byType?.map((item) => (
                        <TableRow key={item.activityType}>
                          <TableCell className="font-medium">
                            {activityTypeLabels[item.activityType] || item.activityType}
                          </TableCell>
                          <TableCell className="text-right">{item.count}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.total)}
                          </TableCell>
                          <TableCell className="text-right">
                            {costSummary.totalCost > 0
                              ? ((item.total / costSummary.totalCost) * 100).toFixed(1)
                              : 0}
                            %
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {costSummary?.activityCount || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(costSummary?.totalCost || 0)}
                        </TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing & Terms Tab */}
          <TabsContent value="pricing" className="space-y-6">
            {/* Hero Banner */}
            <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzEuNjU3IDAgMy0xLjM0MyAzLTNzLTEuMzQzLTMtMy0zLTMgMS4zNDMtMyAzIDEuMzQzIDMgMyAzem0xMiAxOGMxLjY1NyAwIDMtMS4zNDMgMy0zcy0xLjM0My0zLTMtMy0zIDEuMzQzLTMgMyAxLjM0MyAzIDMgM3pNMTIgMzZjMS42NTcgMCAzLTEuMzQzIDMtM3MtMS4zNDMtMy0zLTMtMyAxLjM0My0zIDMgMS4zNDMgMyAzIDN6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                    <Sparkles className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">Your Pricing Plan</h2>
                    <p className="text-slate-300 text-sm">Custom pricing tailored to your programs</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active Agreement
                  </Badge>
                  <Badge className="bg-white/10 text-slate-300 border-white/20 hover:bg-white/20">
                    Cost Per Lead (CPL)
                  </Badge>
                </div>
              </div>
            </div>

            {/* Pricing Cards */}
            {campaignPricingData?.pricing ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Service Pricing</h3>
                  <Badge variant="secondary" className="ml-auto">
                    {Object.values(campaignPricingData.pricing).filter(c => c.isEnabled).length} active services
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(campaignPricingData.pricing)
                    .filter(([, config]) => config.isEnabled)
                    .sort(([, a], [, b]) => a.pricePerLead - b.pricePerLead)
                    .map(([type, config], index) => {
                      // Map campaign types to icons and accent colors
                      const serviceConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string; borderColor: string; description: string }> = {
                        event_registration_digital_ungated: {
                          icon: <MousePointerClick className="h-6 w-6" />,
                          color: 'text-blue-600',
                          bgColor: 'bg-blue-50',
                          borderColor: 'border-blue-200 hover:border-blue-300',
                          description: 'No form required — click-through registrations',
                        },
                        event_registration_digital_gated: {
                          icon: <ClipboardCheck className="h-6 w-6" />,
                          color: 'text-violet-600',
                          bgColor: 'bg-violet-50',
                          borderColor: 'border-violet-200 hover:border-violet-300',
                          description: 'Form-based registration with lead capture',
                        },
                        in_person_event: {
                          icon: <Users className="h-6 w-6" />,
                          color: 'text-amber-600',
                          bgColor: 'bg-amber-50',
                          borderColor: 'border-amber-200 hover:border-amber-300',
                          description: 'Executive dinners, conferences & roundtables',
                        },
                        appointment_generation: {
                          icon: <Handshake className="h-6 w-6" />,
                          color: 'text-emerald-600',
                          bgColor: 'bg-emerald-50',
                          borderColor: 'border-emerald-200 hover:border-emerald-300',
                          description: 'Confirmed meetings with your target audience',
                        },
                      };

                      const svc = serviceConfig[type] || {
                        icon: <Tag className="h-6 w-6" />,
                        color: 'text-slate-600',
                        bgColor: 'bg-slate-50',
                        borderColor: 'border-slate-200 hover:border-slate-300',
                        description: '',
                      };

                      return (
                        <Card
                          key={type}
                          className={`relative overflow-hidden transition-all duration-200 ${svc.borderColor} hover:shadow-md`}
                        >
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl ${svc.bgColor} ${svc.color}`}>
                                  {svc.icon}
                                </div>
                                <div className="space-y-1">
                                  <h4 className="font-semibold text-base">{config.label}</h4>
                                  {svc.description && (
                                    <p className="text-sm text-muted-foreground leading-snug">{svc.description}</p>
                                  )}
                                  {config.minimumOrderSize > 0 && (
                                    <div className="flex items-center gap-1 mt-2">
                                      <Badge variant="outline" className="text-xs font-normal">
                                        Min. order: {config.minimumOrderSize}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <div className="text-2xl font-bold tracking-tight">
                                  {formatCurrency(config.pricePerLead)}
                                </div>
                                <p className="text-xs text-muted-foreground">per lead</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading pricing...
                </CardContent>
              </Card>
            )}

            {/* Billing Terms - Redesigned */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Billing Terms</h3>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x">
                    <div className="p-6 flex flex-col items-center text-center space-y-2">
                      <div className="p-3 rounded-full bg-blue-50">
                        <Calendar className="h-5 w-5 text-blue-600" />
                      </div>
                      <p className="text-sm font-medium">Billing Cycle</p>
                      <p className="text-sm text-muted-foreground">Monthly</p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center space-y-2">
                      <div className="p-3 rounded-full bg-violet-50">
                        <FileText className="h-5 w-5 text-violet-600" />
                      </div>
                      <p className="text-sm font-medium">Invoice Date</p>
                      <p className="text-sm text-muted-foreground">
                        {billingConfig?.invoiceDayOfMonth
                          ? `${ordinalSuffix(billingConfig.invoiceDayOfMonth)} of month`
                          : '1st of month'}
                      </p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center space-y-2">
                      <div className="p-3 rounded-full bg-amber-50">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </div>
                      <p className="text-sm font-medium">Payment Due</p>
                      <p className="text-sm text-muted-foreground">
                        {billingConfig?.paymentDueDayOfMonth
                          ? `By the ${ordinalSuffix(billingConfig.paymentDueDayOfMonth)}`
                          : `NET ${billingConfig?.paymentTermsDays || 30}`}
                      </p>
                    </div>
                    <div className="p-6 flex flex-col items-center text-center space-y-2">
                      <div className="p-3 rounded-full bg-emerald-50">
                        <Banknote className="h-5 w-5 text-emerald-600" />
                      </div>
                      <p className="text-sm font-medium">Currency</p>
                      <p className="text-sm text-muted-foreground">{billingConfig?.currency || 'USD'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pricing Documents - Redesigned */}
            {pricingDocsData?.documents && pricingDocsData.documents.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Pricing Documents</h3>
                </div>
                <div className="grid gap-3">
                  {pricingDocsData.documents.map((doc) => (
                    <Card key={doc.id} className="hover:shadow-md transition-all duration-200">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl text-white shadow-sm">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-semibold">{doc.name}</p>
                              {doc.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">{doc.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-xs text-muted-foreground">{doc.fileName}</span>
                                {doc.fileSize && (
                                  <>
                                    <Separator orientation="vertical" className="h-3" />
                                    <span className="text-xs text-muted-foreground">
                                      {(doc.fileSize / 1024).toFixed(1)} KB
                                    </span>
                                  </>
                                )}
                                <Separator orientation="vertical" className="h-3" />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePricingDocDownload(doc.id)}
                            className="shrink-0"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientPortalLayout>
  );
}
