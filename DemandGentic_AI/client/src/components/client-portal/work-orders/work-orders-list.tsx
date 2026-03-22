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

const STATUS_CONFIG: Record = {
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

const ORDER_TYPE_ICONS: Record = {
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  const { data, isLoading, error } = useQuery({
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
      
        
        {config.label}
      
    );
  };

  const getOrderTypeIcon = (type: string) => {
    const Icon = ORDER_TYPE_ICONS[type] || FileText;
    return ;
  };

  if (error) {
    return (
      
        
          
          Failed to load Direct Agentic Orders
          Please try again later
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          Direct Agentic Orders
          Track your campaign requests and their progress
        
         setShowCreateForm(true)}>
          
          New Direct Agentic Order
        
      

      {/* Filters */}
      
        
          
           setSearchQuery(e.target.value)}
            className="pl-9"
          />
        
        
          
            
          
          
            All Status
            Draft
            Submitted
            Under Review
            Approved
            In Progress
            Completed
          
        
      

      {/* Orders List */}
      {isLoading ? (
        
          {[1, 2, 3].map((i) => (
            
              
                
                  
                  
                    
                    
                    
                      
                      
                    
                  
                
              
            
          ))}
        
      ) : filteredOrders.length === 0 ? (
        
          
            
            No work orders yet
            
              Create your first work order to request campaigns or lead generation
            
             setShowCreateForm(true)}>
              
              Create Work Order
            
          
        
      ) : (
        
          {filteredOrders.map((order) => (
            
              
                
                  
                    {getOrderTypeIcon(order.orderType)}
                  

                  
                    
                      
                        
                          {order.title}
                          
                            {order.orderNumber}
                          
                        
                        {order.description && (
                          
                            {order.description}
                          
                        )}
                      
                      {getStatusBadge(order.status)}
                    

                    
                      {order.targetLeadCount && (
                        
                          
                          {order.targetLeadCount.toLocaleString()} leads
                        
                      )}
                      {order.requestedStartDate && (
                        
                          
                          {order.requestedStartDate}
                        
                      )}
                      {order.estimatedBudget && (
                        ${parseFloat(order.estimatedBudget).toLocaleString()}
                      )}
                      
                        Created {format(new Date(order.createdAt), 'MMM d, yyyy')}
                      
                    

                    {/* Progress bar for in-progress orders */}
                    {['in_progress', 'qa_review'].includes(order.status) && (
                      
                        
                          Progress
                          {order.progressPercent || 0}%
                        
                        
                        {(order.leadsGenerated || order.leadsDelivered) && (
                          
                            {order.leadsGenerated && (
                              {order.leadsGenerated} generated
                            )}
                            {order.leadsDelivered && (
                              {order.leadsDelivered} delivered
                            )}
                          
                        )}
                      
                    )}
                  
                
              
            
          ))}
        
      )}

      {/* Create Form Dialog */}
      
    
  );
}

export default WorkOrdersList;