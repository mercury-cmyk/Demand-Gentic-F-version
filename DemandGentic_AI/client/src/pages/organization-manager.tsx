import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Building2,
  Plus,
  Search,
  Crown,
  Building,
  Megaphone,
  Activity,
  Loader2,
} from 'lucide-react';
import { OrganizationTable } from '@/components/organization-manager/organization-table';
import { CreateEditOrganizationDialog } from '@/components/organization-manager/create-edit-organization-dialog';
import { OrganizationDetailPanel } from '@/components/organization-manager/organization-detail-panel';
import { OrganizationMembersDialog } from '@/components/organization-manager/organization-members-dialog';
import type { Organization, OrganizationStats } from '@/components/organization-manager/types';

export default function OrganizationManagerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [detailOrg, setDetailOrg] = useState(null);
  const [membersOrg, setMembersOrg] = useState(null);

  // Queries
  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['/api/organizations', typeFilter, activeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
      if (activeFilter && activeFilter !== 'all') params.set('active', activeFilter === 'active' ? 'true' : 'false');
      if (searchQuery) params.set('search', searchQuery);
      const url = `/api/organizations${params.toString() ? `?${params}` : ''}`;
      const res = await apiRequest('GET', url);
      return res.json() as Promise;
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/organizations/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organizations/stats');
      return res.json() as Promise;
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest('DELETE', `/api/organizations/${orgId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations/stats'] });
      toast({ title: 'Organization deleted', description: 'Organization has been deactivated.' });
      setDeletingOrg(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
      setDeletingOrg(null);
    },
  });

  const organizations = orgsData?.organizations || [];
  const stats = statsData?.stats;

  return (
    
      {/* Header */}
      
        
          
            
            Organization Manager
          
          
            Manage all organizations: super, client, and campaign
          
        
         setCreateDialogOpen(true)}>
          
          New Organization
        
      

      {/* Stats Cards */}
      {stats && (
        
          
            
              Total Organizations
              
            
            
              {stats.total}
              {stats.active} active
            
          
          
            
              Super
              
            
            
              {stats.byType.super}
              Platform organization
            
          
          
            
              Client
              
            
            
              {stats.byType.client}
              Client organizations
            
          
          
            
              Campaign
              
            
            
              {stats.byType.campaign}
              Campaign organizations
            
          
        
      )}

      {/* Filters */}
      
        
          
           setSearchQuery(e.target.value)}
            className="pl-9"
          />
        
        
          
            
          
          
            All Types
            Super
            Client
            Campaign
          
        
        
          
            
          
          
            All Status
            Active
            Inactive
          
        
      

      {/* Table */}
      {orgsLoading ? (
        
          
        
      ) : (
         setEditingOrg(org)}
          onDelete={(org) => setDeletingOrg(org)}
          onViewMembers={(org) => setMembersOrg(org)}
          onViewDetails={(org) => setDetailOrg(org)}
        />
      )}

      {/* Create Dialog */}
      

      {/* Edit Dialog */}
       { if (!open) setEditingOrg(null); }}
        organization={editingOrg}
      />

      {/* Detail Panel */}
       { if (!open) setDetailOrg(null); }}
        organization={detailOrg}
        onEdit={(org) => { setDetailOrg(null); setEditingOrg(org); }}
        onViewMembers={(org) => { setDetailOrg(null); setMembersOrg(org); }}
      />

      {/* Members Dialog */}
       { if (!open) setMembersOrg(null); }}
        organization={membersOrg}
      />

      {/* Delete Confirmation */}
       setDeletingOrg(null)}>
        
          
            Delete Organization
            
              Are you sure you want to delete {deletingOrg?.name}? This will
              deactivate the organization. It can be reactivated later.
            
          
          
            Cancel
             {
                if (deletingOrg) {
                  deleteMutation.mutate(deletingOrg.id);
                }
              }}
            >
              {deleteMutation.isPending && }
              Delete
            
          
        
      
    
  );
}