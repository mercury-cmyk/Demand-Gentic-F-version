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
  byType: Array;
  monthlyTrend: Array;
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

const activityTypeLabels: Record = {
  lead_delivered: 'Leads Delivered',
  contact_verified: 'Contacts Verified',
  ai_call_minute: 'AI Call Minutes',
  email_sent: 'Emails Sent',
  retainer_fee: 'Retainer Fee',
  setup_fee: 'Setup Fee',
};

const ordinalSuffix = (day: number): string => {
  if (day >= 11 && day  = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  void: 'bg-gray-100 text-gray-600',
};

export default function ClientPortalBilling() {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: costSummary, isLoading: loadingCosts } = useQuery({
    queryKey: ['client-portal-costs-summary'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/costs/summary', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch costs');
      return res.json();
    },
  });

  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ['client-portal-invoices'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/invoices', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      return res.json();
    },
  });

  const { data: billingConfig } = useQuery({
    queryKey: ['client-portal-billing-config'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/billing/config', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch billing config');
      return res.json();
    },
  });

  const { data: campaignPricingData } = useQuery;
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

  const { data: pricingDocsData } = useQuery;
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
    
      
        {/* Header */}
        
          Billing & Costs
          
            Track your spending and manage invoices
          
        

        {/* Summary Cards */}
        
          
            
              This Month
              
            
            
              
                {loadingCosts ? (
                  
                ) : (
                  formatCurrency(costSummary?.totalCost || 0)
                )}
              
              
                {costSummary?.activityCount || 0} activities
              
            
          

          
            
              Uninvoiced
              
            
            
              
                {loadingCosts ? (
                  
                ) : (
                  formatCurrency(costSummary?.uninvoicedTotal || 0)
                )}
              
              
                {costSummary?.uninvoicedCount || 0} items pending
              
            
          

          
            
              Pending Invoices
              
            
            
              {pendingInvoices.length}
              
                {formatCurrency(
                  pendingInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0)
                )}{' '}
                due
              
            
          

           0 ? 'border-red-200 bg-red-50/50' : ''}>
            
              Overdue
               0 ? 'text-red-500' : 'text-muted-foreground'
                }`}
              />
            
            
               0 ? 'text-red-600' : ''
                }`}
              >
                {overdueInvoices.length}
              
              {overdueInvoices.length > 0 && (
                
                  {formatCurrency(
                    overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0)
                  )}{' '}
                  overdue
                
              )}
            
          
        

        {/* Tabs */}
        
          
            Overview
            Invoices
            Cost Breakdown
            Pricing & Terms
          

          {/* Overview Tab */}
          
            
              {/* Monthly Trend Chart */}
              
                
                  Monthly Spending Trend
                  Last 6 months
                
                
                  {loadingCosts ? (
                    
                      
                    
                  ) : (
                    
                      
                        
                        
                         `$${v}`} />
                         formatCurrency(value)}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        
                      
                    
                  )}
                
              

              {/* Cost by Type Pie Chart */}
              
                
                  Spending by Category
                  This month
                
                
                  {loadingCosts ? (
                    
                      
                    
                  ) : costSummary?.byType?.length ? (
                    
                      
                        
                          
                            {costSummary.byType.map((_, index) => (
                              
                            ))}
                          
                           formatCurrency(value)} />
                        
                      
                      
                        {costSummary.byType.map((item, index) => (
                          
                            
                            
                              {activityTypeLabels[item.activityType] || item.activityType}
                            
                            
                              {formatCurrency(item.total)}
                            
                          
                        ))}
                      
                    
                  ) : (
                    
                      No spending data this month
                    
                  )}
                
              
            
          

          {/* Invoices Tab */}
          
            
              
                All Invoices
                Your invoice history
              
              
                {loadingInvoices ? (
                  
                    
                  
                ) : invoices?.length === 0 ? (
                  
                    
                    No invoices yet
                  
                ) : (
                  
                    
                      
                        Invoice #
                        Period
                        Amount
                        Status
                        Due Date
                        Actions
                      
                    
                    
                      {invoices?.map((invoice) => (
                        
                          
                            {invoice.invoiceNumber}
                          
                          
                            {new Date(invoice.billingPeriodStart).toLocaleDateString()} -{' '}
                            {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                          
                          
                            {formatCurrency(invoice.totalAmount)}
                            {invoice.balanceDue > 0 && invoice.balanceDue 
                                {formatCurrency(invoice.balanceDue)} remaining
                              
                            )}
                          
                          
                            
                              {invoice.status}
                            
                          
                          
                            {invoice.dueDate
                              ? new Date(invoice.dueDate).toLocaleDateString()
                              : '-'}
                          
                          
                            
                              {invoice.pdfUrl && (
                                
                                  
                                    
                                  
                                
                              )}
                              
                                
                                  
                                
                              
                            
                          
                        
                      ))}
                    
                  
                )}
              
            
          

          {/* Cost Breakdown Tab */}
          
            
              
                Cost Breakdown by Type
                Detailed view of your spending
              
              
                {loadingCosts ? (
                  
                    
                  
                ) : costSummary?.byType?.length === 0 ? (
                  
                    
                    No costs recorded yet
                  
                ) : (
                  
                    
                      
                        Category
                        Count
                        Total
                        % of Total
                      
                    
                    
                      {costSummary?.byType?.map((item) => (
                        
                          
                            {activityTypeLabels[item.activityType] || item.activityType}
                          
                          {item.count}
                          
                            {formatCurrency(item.total)}
                          
                          
                            {costSummary.totalCost > 0
                              ? ((item.total / costSummary.totalCost) * 100).toFixed(1)
                              : 0}
                            %
                          
                        
                      ))}
                      
                        Total
                        
                          {costSummary?.activityCount || 0}
                        
                        
                          {formatCurrency(costSummary?.totalCost || 0)}
                        
                        100%
                      
                    
                  
                )}
              
            
          

          {/* Pricing & Terms Tab */}
          
            {/* Hero Banner */}
            
              
              
                
                  
                    
                  
                  
                    Your Pricing Plan
                    Custom pricing tailored to your programs
                  
                
                
                  
                    
                    Active Agreement
                  
                  
                    Cost Per Lead (CPL)
                  
                
              
            

            {/* Pricing Cards */}
            {campaignPricingData?.pricing ? (
              
                
                  
                  Service Pricing
                  
                    {Object.values(campaignPricingData.pricing).filter(c => c.isEnabled).length} active services
                  
                
                
                  {Object.entries(campaignPricingData.pricing)
                    .filter(([, config]) => config.isEnabled)
                    .sort(([, a], [, b]) => a.pricePerLead - b.pricePerLead)
                    .map(([type, config], index) => {
                      // Map campaign types to icons and accent colors
                      const serviceConfig: Record = {
                        event_registration_digital_ungated: {
                          icon: ,
                          color: 'text-blue-600',
                          bgColor: 'bg-blue-50',
                          borderColor: 'border-blue-200 hover:border-blue-300',
                          description: 'No form required — click-through registrations',
                        },
                        event_registration_digital_gated: {
                          icon: ,
                          color: 'text-violet-600',
                          bgColor: 'bg-violet-50',
                          borderColor: 'border-violet-200 hover:border-violet-300',
                          description: 'Form-based registration with lead capture',
                        },
                        in_person_event: {
                          icon: ,
                          color: 'text-amber-600',
                          bgColor: 'bg-amber-50',
                          borderColor: 'border-amber-200 hover:border-amber-300',
                          description: 'Executive dinners, conferences & roundtables',
                        },
                        appointment_generation: {
                          icon: ,
                          color: 'text-emerald-600',
                          bgColor: 'bg-emerald-50',
                          borderColor: 'border-emerald-200 hover:border-emerald-300',
                          description: 'Confirmed meetings with your target audience',
                        },
                      };

                      const svc = serviceConfig[type] || {
                        icon: ,
                        color: 'text-slate-600',
                        bgColor: 'bg-slate-50',
                        borderColor: 'border-slate-200 hover:border-slate-300',
                        description: '',
                      };

                      return (
                        
                          
                            
                              
                                
                                  {svc.icon}
                                
                                
                                  {config.label}
                                  {svc.description && (
                                    {svc.description}
                                  )}
                                  {config.minimumOrderSize > 0 && (
                                    
                                      
                                        Min. order: {config.minimumOrderSize}
                                      
                                    
                                  )}
                                
                              
                              
                                
                                  {formatCurrency(config.pricePerLead)}
                                
                                per lead
                              
                            
                          
                        
                      );
                    })}
                
              
            ) : (
              
                
                  
                  Loading pricing...
                
              
            )}

            {/* Billing Terms - Redesigned */}
            
              
                
                Billing Terms
              
              
                
                  
                    
                      
                        
                      
                      Billing Cycle
                      Monthly
                    
                    
                      
                        
                      
                      Invoice Date
                      
                        {billingConfig?.invoiceDayOfMonth
                          ? `${ordinalSuffix(billingConfig.invoiceDayOfMonth)} of month`
                          : '1st of month'}
                      
                    
                    
                      
                        
                      
                      Payment Due
                      
                        {billingConfig?.paymentDueDayOfMonth
                          ? `By the ${ordinalSuffix(billingConfig.paymentDueDayOfMonth)}`
                          : `NET ${billingConfig?.paymentTermsDays || 30}`}
                      
                    
                    
                      
                        
                      
                      Currency
                      {billingConfig?.currency || 'USD'}
                    
                  
                
              
            

            {/* Pricing Documents - Redesigned */}
            {pricingDocsData?.documents && pricingDocsData.documents.length > 0 && (
              
                
                  
                  Pricing Documents
                
                
                  {pricingDocsData.documents.map((doc) => (
                    
                      
                        
                          
                            
                              
                            
                            
                              {doc.name}
                              {doc.description && (
                                {doc.description}
                              )}
                              
                                {doc.fileName}
                                {doc.fileSize && (
                                  <>
                                    
                                    
                                      {(doc.fileSize / 1024).toFixed(1)} KB
                                    
                                  
                                )}
                                
                                
                                  {new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                
                              
                            
                          
                           handlePricingDocDownload(doc.id)}
                            className="shrink-0"
                          >
                            
                            Download
                          
                        
                      
                    
                  ))}
                
              
            )}
          
        
      
    
  );
}