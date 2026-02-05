/**
 * Work Orders List Component
 *
 * Displays client's work orders with status, progress, and actions
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText, Plus, Search, Clock, CheckCircle2, XCircle,
  AlertCircle, Loader2, Phone, Mail, Target, Sparkles,
  Calendar, Users, Building2, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkOrderForm } from './work-order-form';
import { format } from 'date-fns';

interface WorkOrder {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  orderType: string;
  priority: string;
  status: string;
  targetLeadCount?: number;
  leadsGenerated?: number;
  leadsDelivered?: number;
  progressPercent?: number;
  requestedStartDate?: string;
  requestedEndDate?: string;
  estimatedBudget?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: FileText },
  submitted: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', icon: Clock },
  under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700', icon: Loader2 },
  qa_review: { label: 'QA Review', color: 'bg-indigo-100 text-indigo-700', icon: Eye },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  on_hold: { label: 'On Hold', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

const ORDER_TYPE_ICONS: Record<string, typeof Phone> = {
  call_campaign: Phone,
  email_campaign: Mail,
  combo_campaign: Sparkles,
  lead_generation: Target,
  appointment_setting: Calendar,
  data_enrichment: Users,
  market_research: Building2,
  custom: FileText,
};

export function WorkOrdersList() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  const { data, isLoading, error } = useQuery<{ workOrders: WorkOrder[] }>({
    queryKey: ['work-orders', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/client-portal/work-orders/client?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch work orders');
      return res.json();
    },
  });

  const workOrders = data?.workOrders || [];

  const filteredOrders = workOrders.filter(order =>
    order.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
      <Badge className={cn('gap-1', config.color)}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getOrderTypeIcon = (type: string) => {
    const Icon = ORDER_TYPE_ICONS[type] || FileText;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-lg font-medium">Failed to load Direct Agentic Orders</p>
          <p className="text-sm text-muted-foreground">Please try again later</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Direct Agentic Orders</h2>
          <p className="text-muted-foreground">Track your campaign requests and their progress</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Direct Agentic Order
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Direct Agentic Orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-96" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No work orders yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first work order to request campaigns or lead generation
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Work Order
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-muted rounded-lg">
                    {getOrderTypeIcon(order.orderType)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{order.title}</h3>
                          <span className="text-sm text-muted-foreground">
                            {order.orderNumber}
                          </span>
                        </div>
                        {order.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {order.description}
                          </p>
                        )}
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                      {order.targetLeadCount && (
                        <span className="flex items-center gap-1">
                          <Target className="h-3.5 w-3.5" />
                          {order.targetLeadCount.toLocaleString()} leads
                        </span>
                      )}
                      {order.requestedStartDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {order.requestedStartDate}
                        </span>
                      )}
                      {order.estimatedBudget && (
                        <span>${parseFloat(order.estimatedBudget).toLocaleString()}</span>
                      )}
                      <span>
                        Created {format(new Date(order.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>

                    {/* Progress bar for in-progress orders */}
                    {['in_progress', 'qa_review'].includes(order.status) && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{order.progressPercent || 0}%</span>
                        </div>
                        <Progress value={order.progressPercent || 0} className="h-2" />
                        {(order.leadsGenerated || order.leadsDelivered) && (
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            {order.leadsGenerated && (
                              <span>{order.leadsGenerated} generated</span>
                            )}
                            {order.leadsDelivered && (
                              <span>{order.leadsDelivered} delivered</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Form Dialog */}
      <WorkOrderForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
      />
    </div>
  );
}

export default WorkOrdersList;
