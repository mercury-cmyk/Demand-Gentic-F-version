import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  CreditCard,
  ChevronRight,
  Loader2,
  Download,
  AlertCircle,
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
        </Tabs>
      </div>
    </ClientPortalLayout>
  );
}
