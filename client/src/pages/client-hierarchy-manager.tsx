/**
 * Client Hierarchy Manager Page
 * Admin interface for managing the three-tier hierarchy:
 * Super Organization -> Campaign Organizations -> Clients
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Users,
  Link2,
  Unlink,
  Star,
  RefreshCw,
  Plus,
  ChevronRight,
  Network,
  Building,
  UserCircle,
} from "lucide-react";

// Types
interface ClientAccount {
  id: string;
  name: string;
  companyName: string | null;
  contactEmail: string | null;
  isActive: boolean;
}

interface CampaignOrganization {
  id: string;
  name: string;
  domain: string | null;
  organizationType: string;
  isActive: boolean;
}

interface ClientOrgLink {
  organizationId: string;
  organizationName: string;
  relationshipType: string;
  isPrimary: boolean;
  linkedAt: string;
}

interface HierarchyStats {
  totalClients: number;
  linkedClients: number;
  unlinkedClients: number;
  totalOrganizations: number;
  totalLinks: number;
}

// API functions
async function fetchHierarchyStats(): Promise<{ success: boolean; stats: HierarchyStats }> {
  const response = await fetch('/api/admin/hierarchy/stats', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

async function fetchUnlinkedClients(): Promise<{ success: boolean; clients: ClientAccount[] }> {
  const response = await fetch('/api/admin/hierarchy/unlinked-clients', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch unlinked clients');
  return response.json();
}

async function fetchAvailableOrganizations(): Promise<{ success: boolean; organizations: CampaignOrganization[] }> {
  const response = await fetch('/api/admin/hierarchy/available-organizations', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch organizations');
  return response.json();
}

async function fetchClientOrganizations(clientId: string): Promise<{ success: boolean; organizations: ClientOrgLink[] }> {
  const response = await fetch(`/api/admin/clients/${clientId}/organizations`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch client organizations');
  return response.json();
}

async function fetchOrganizationClients(orgId: string) {
  const response = await fetch(`/api/admin/organizations/${orgId}/clients`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch organization clients');
  return response.json();
}

async function linkClientToOrg(params: {
  clientId: string;
  organizationId: string;
  relationshipType: string;
  isPrimary: boolean;
}) {
  const response = await fetch(`/api/admin/clients/${params.clientId}/link-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      organizationId: params.organizationId,
      relationshipType: params.relationshipType,
      isPrimary: params.isPrimary,
    }),
  });
  if (!response.ok) throw new Error('Failed to link client');
  return response.json();
}

async function unlinkClientFromOrg(clientId: string, organizationId: string) {
  const response = await fetch(`/api/admin/clients/${clientId}/link-organization/${organizationId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to unlink client');
  return response.json();
}

async function setPrimaryOrg(clientId: string, organizationId: string) {
  const response = await fetch(`/api/admin/clients/${clientId}/primary-organization`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ organizationId }),
  });
  if (!response.ok) throw new Error('Failed to set primary organization');
  return response.json();
}

export default function ClientHierarchyManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedClient, setSelectedClient] = useState<ClientAccount | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<CampaignOrganization | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({
    clientId: '',
    organizationId: '',
    relationshipType: 'managed',
    isPrimary: false,
  });

  // Queries
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['hierarchy-stats'],
    queryFn: fetchHierarchyStats,
  });

  const { data: unlinkedClientsData } = useQuery({
    queryKey: ['unlinked-clients'],
    queryFn: fetchUnlinkedClients,
  });

  const { data: organizationsData } = useQuery({
    queryKey: ['available-organizations'],
    queryFn: fetchAvailableOrganizations,
  });

  const { data: clientOrgsData } = useQuery({
    queryKey: ['client-organizations', selectedClient?.id],
    queryFn: () => fetchClientOrganizations(selectedClient!.id),
    enabled: !!selectedClient,
  });

  const { data: orgClientsData } = useQuery({
    queryKey: ['organization-clients', selectedOrg?.id],
    queryFn: () => fetchOrganizationClients(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  // Mutations
  const linkMutation = useMutation({
    mutationFn: linkClientToOrg,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hierarchy-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unlinked-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-clients'] });
      toast({ title: 'Client linked to organization successfully' });
      setLinkDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Failed to link client', variant: 'destructive' });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ clientId, organizationId }: { clientId: string; organizationId: string }) =>
      unlinkClientFromOrg(clientId, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hierarchy-stats'] });
      queryClient.invalidateQueries({ queryKey: ['unlinked-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-clients'] });
      toast({ title: 'Client unlinked from organization' });
    },
    onError: () => {
      toast({ title: 'Failed to unlink client', variant: 'destructive' });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: ({ clientId, organizationId }: { clientId: string; organizationId: string }) =>
      setPrimaryOrg(clientId, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-organizations'] });
      toast({ title: 'Primary organization updated' });
    },
    onError: () => {
      toast({ title: 'Failed to set primary organization', variant: 'destructive' });
    },
  });

  const stats = statsData?.stats;
  const unlinkedClients = unlinkedClientsData?.clients || [];
  const organizations = organizationsData?.organizations || [];
  const clientOrgs = clientOrgsData?.organizations || [];
  const orgClients = orgClientsData?.clients || [];

  const getRelationshipBadge = (type: string) => {
    const colors: Record<string, string> = {
      managed: 'bg-blue-100 text-blue-700',
      partner: 'bg-purple-100 text-purple-700',
      reseller: 'bg-green-100 text-green-700',
    };
    return (
      <Badge variant="outline" className={colors[type] || 'bg-gray-100'}>
        {type}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6" />
            Client Hierarchy Manager
          </h1>
          <p className="text-muted-foreground">
            Manage the three-tier hierarchy: Super Org → Campaign Orgs → Clients
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Clients</CardDescription>
              <CardTitle className="text-2xl">{stats.totalClients}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Linked Clients</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.linkedClients}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unlinked Clients</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">{stats.unlinkedClients}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Organizations</CardDescription>
              <CardTitle className="text-2xl">{stats.totalOrganizations}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Links</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{stats.totalLinks}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organizations Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Campaign Organizations
            </CardTitle>
            <CardDescription>Select an organization to view its clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedOrg?.id === org.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => {
                    setSelectedOrg(org);
                    setSelectedClient(null);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{org.name}</span>
                    </div>
                    <Badge variant={org.organizationType === 'super' ? 'default' : 'secondary'}>
                      {org.organizationType}
                    </Badge>
                  </div>
                  {org.domain && (
                    <span className="text-xs text-muted-foreground ml-6">{org.domain}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Selected Organization's Clients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedOrg ? `${selectedOrg.name} - Clients` : 'Organization Clients'}
            </CardTitle>
            <CardDescription>
              {selectedOrg ? 'Clients linked to this organization' : 'Select an organization to view clients'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedOrg ? (
              orgClients.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgClients.map((client: any) => (
                      <TableRow key={client.clientAccountId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{client.clientName}</div>
                            <div className="text-xs text-muted-foreground">{client.companyName}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getRelationshipBadge(client.relationshipType)}</TableCell>
                        <TableCell>
                          {client.isPrimary && (
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => unlinkMutation.mutate({
                              clientId: client.clientAccountId,
                              organizationId: selectedOrg.id,
                            })}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No clients linked to this organization
                </div>
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Select an organization to view its clients
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Unlinked Clients */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                Unlinked Clients
              </CardTitle>
              <CardDescription>
                Clients that are not linked to any campaign organization
              </CardDescription>
            </div>
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={unlinkedClients.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  Link Client
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Link Client to Organization</DialogTitle>
                  <DialogDescription>
                    Create a relationship between a client and a campaign organization
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select
                      value={linkForm.clientId}
                      onValueChange={(v) => setLinkForm(prev => ({ ...prev, clientId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name} {client.companyName && `(${client.companyName})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Select
                      value={linkForm.organizationId}
                      onValueChange={(v) => setLinkForm(prev => ({ ...prev, organizationId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations
                          .filter(o => o.organizationType !== 'super')
                          .map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Relationship Type</Label>
                    <Select
                      value={linkForm.relationshipType}
                      onValueChange={(v) => setLinkForm(prev => ({ ...prev, relationshipType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="managed">Managed</SelectItem>
                        <SelectItem value="partner">Partner</SelectItem>
                        <SelectItem value="reseller">Reseller</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPrimary"
                      checked={linkForm.isPrimary}
                      onCheckedChange={(checked) =>
                        setLinkForm(prev => ({ ...prev, isPrimary: checked as boolean }))
                      }
                    />
                    <Label htmlFor="isPrimary">Set as primary organization</Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => linkMutation.mutate(linkForm)}
                    disabled={!linkForm.clientId || !linkForm.organizationId || linkMutation.isPending}
                  >
                    {linkMutation.isPending ? 'Linking...' : 'Link Client'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {unlinkedClients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unlinkedClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.companyName || '-'}</TableCell>
                    <TableCell>{client.contactEmail || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? 'default' : 'secondary'}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              All clients are linked to organizations
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
