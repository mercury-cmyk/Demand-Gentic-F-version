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
async function fetchHierarchyStats(): Promise {
  const response = await fetch('/api/admin/hierarchy/stats', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

async function fetchUnlinkedClients(): Promise {
  const response = await fetch('/api/admin/hierarchy/unlinked-clients', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch unlinked clients');
  return response.json();
}

async function fetchAvailableOrganizations(): Promise {
  const response = await fetch('/api/admin/hierarchy/available-organizations', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch organizations');
  return response.json();
}

async function fetchClientOrganizations(clientId: string): Promise {
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
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
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
    const colors: Record = {
      managed: 'bg-blue-100 text-blue-700',
      partner: 'bg-purple-100 text-purple-700',
      reseller: 'bg-green-100 text-green-700',
    };
    return (
      
        {type}
      
    );
  };

  return (
    
      {/* Header */}
      
        
          
            
            Client Hierarchy Manager
          
          
            Manage the three-tier hierarchy: Super Org → Campaign Orgs → Clients
          
        
         queryClient.invalidateQueries()}
        >
          
          Refresh
        
      

      {/* Stats Cards */}
      {stats && (
        
          
            
              Total Clients
              {stats.totalClients}
            
          
          
            
              Linked Clients
              {stats.linkedClients}
            
          
          
            
              Unlinked Clients
              {stats.unlinkedClients}
            
          
          
            
              Organizations
              {stats.totalOrganizations}
            
          
          
            
              Total Links
              {stats.totalLinks}
            
          
        
      )}

      
        {/* Organizations Panel */}
        
          
            
              
              Campaign Organizations
            
            Select an organization to view its clients
          
          
            
              {organizations.map((org) => (
                 {
                    setSelectedOrg(org);
                    setSelectedClient(null);
                  }}
                >
                  
                    
                      
                      {org.name}
                    
                    
                      {org.organizationType}
                    
                  
                  {org.domain && (
                    {org.domain}
                  )}
                
              ))}
            
          
        

        {/* Selected Organization's Clients */}
        
          
            
              
              {selectedOrg ? `${selectedOrg.name} - Clients` : 'Organization Clients'}
            
            
              {selectedOrg ? 'Clients linked to this organization' : 'Select an organization to view clients'}
            
          
          
            {selectedOrg ? (
              orgClients.length > 0 ? (
                
                  
                    
                      Client
                      Relationship
                      Primary
                      Actions
                    
                  
                  
                    {orgClients.map((client: any) => (
                      
                        
                          
                            {client.clientName}
                            {client.companyName}
                          
                        
                        {getRelationshipBadge(client.relationshipType)}
                        
                          {client.isPrimary && (
                            
                          )}
                        
                        
                           unlinkMutation.mutate({
                              clientId: client.clientAccountId,
                              organizationId: selectedOrg.id,
                            })}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              ) : (
                
                  No clients linked to this organization
                
              )
            ) : (
              
                Select an organization to view its clients
              
            )}
          
        
      

      {/* Unlinked Clients */}
      
        
          
            
              
                
                Unlinked Clients
              
              
                Clients that are not linked to any campaign organization
              
            
            
              
                
                  
                  Link Client
                
              
              
                
                  Link Client to Organization
                  
                    Create a relationship between a client and a campaign organization
                  
                

                
                  
                    Client
                     setLinkForm(prev => ({ ...prev, clientId: v }))}
                    >
                      
                        
                      
                      
                        {unlinkedClients.map((client) => (
                          
                            {client.name} {client.companyName && `(${client.companyName})`}
                          
                        ))}
                      
                    
                  

                  
                    Organization
                     setLinkForm(prev => ({ ...prev, organizationId: v }))}
                    >
                      
                        
                      
                      
                        {organizations
                          .filter(o => o.organizationType !== 'super')
                          .map((org) => (
                            
                              {org.name}
                            
                          ))}
                      
                    
                  

                  
                    Relationship Type
                     setLinkForm(prev => ({ ...prev, relationshipType: v }))}
                    >
                      
                        
                      
                      
                        Managed
                        Partner
                        Reseller
                      
                    
                  

                  
                    
                        setLinkForm(prev => ({ ...prev, isPrimary: checked as boolean }))
                      }
                    />
                    Set as primary organization
                  
                

                
                   setLinkDialogOpen(false)}>
                    Cancel
                  
                   linkMutation.mutate(linkForm)}
                    disabled={!linkForm.clientId || !linkForm.organizationId || linkMutation.isPending}
                  >
                    {linkMutation.isPending ? 'Linking...' : 'Link Client'}
                  
                
              
            
          
        
        
          {unlinkedClients.length > 0 ? (
            
              
                
                  Client Name
                  Company
                  Email
                  Status
                
              
              
                {unlinkedClients.map((client) => (
                  
                    {client.name}
                    {client.companyName || '-'}
                    {client.contactEmail || '-'}
                    
                      
                        {client.isActive ? 'Active' : 'Inactive'}
                      
                    
                  
                ))}
              
            
          ) : (
            
              All clients are linked to organizations
            
          )}
        
      
    
  );
}