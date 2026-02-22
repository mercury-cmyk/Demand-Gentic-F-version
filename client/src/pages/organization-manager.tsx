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
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('active');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const [detailOrg, setDetailOrg] = useState<Organization | null>(null);
  const [membersOrg, setMembersOrg] = useState<Organization | null>(null);

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
      return res.json() as Promise<{ organizations: Organization[]; total: number }>;
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/organizations/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/organizations/stats');
      return res.json() as Promise<{ stats: OrganizationStats }>;
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
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Organization Manager
          </h1>
          <p className="text-muted-foreground">
            Manage all organizations: super, client, and campaign
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Organization
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">{stats.active} active</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Super</CardTitle>
              <Crown className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.super}</div>
              <p className="text-xs text-muted-foreground">Platform organization</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Client</CardTitle>
              <Building className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.client}</div>
              <p className="text-xs text-muted-foreground">Client organizations</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Campaign</CardTitle>
              <Megaphone className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byType.campaign}</div>
              <p className="text-xs text-muted-foreground">Campaign organizations</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or domain..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="super">Super</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="campaign">Campaign</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {orgsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <OrganizationTable
          organizations={organizations}
          onEdit={(org) => setEditingOrg(org)}
          onDelete={(org) => setDeletingOrg(org)}
          onViewMembers={(org) => setMembersOrg(org)}
          onViewDetails={(org) => setDetailOrg(org)}
        />
      )}

      {/* Create Dialog */}
      <CreateEditOrganizationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Edit Dialog */}
      <CreateEditOrganizationDialog
        open={!!editingOrg}
        onOpenChange={(open) => { if (!open) setEditingOrg(null); }}
        organization={editingOrg}
      />

      {/* Detail Panel */}
      <OrganizationDetailPanel
        open={!!detailOrg}
        onOpenChange={(open) => { if (!open) setDetailOrg(null); }}
        organization={detailOrg}
        onEdit={(org) => { setDetailOrg(null); setEditingOrg(org); }}
        onViewMembers={(org) => { setDetailOrg(null); setMembersOrg(org); }}
      />

      {/* Members Dialog */}
      <OrganizationMembersDialog
        open={!!membersOrg}
        onOpenChange={(open) => { if (!open) setMembersOrg(null); }}
        organization={membersOrg}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingOrg} onOpenChange={() => setDeletingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingOrg?.name}</strong>? This will
              deactivate the organization. It can be reactivated later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingOrg) {
                  deleteMutation.mutate(deletingOrg.id);
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
