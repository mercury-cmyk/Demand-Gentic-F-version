/**
 * Super Organization Settings Page
 *
 * Admin dashboard for the Super Organization (Pivotal B2B).
 * Only accessible by organization owners.
 *
 * Features:
 * - Organization overview and profile
 * - Member management (owners only)
 * - Credentials/API keys management
 * - Client organizations management
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Users,
  Key,
  Building,
  Plus,
  Trash2,
  Edit,
  Shield,
  Crown,
  UserCog,
  User,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Save,
  X,
} from 'lucide-react';
import { Megaphone, Search, Loader2, Activity } from 'lucide-react';
import { ROUTES } from '@/lib/routes';
import { OrganizationTable } from '@/components/organization-manager/organization-table';
import { CreateEditOrganizationDialog } from '@/components/organization-manager/create-edit-organization-dialog';
import { OrganizationDetailPanel } from '@/components/organization-manager/organization-detail-panel';
import { OrganizationMembersDialog } from '@/components/organization-manager/organization-members-dialog';
import type { Organization, OrganizationStats } from '@/components/organization-manager/types';

// Types
interface SuperOrganization {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  organizationType: 'super' | 'client';
  isDefault: boolean;
  createdAt: string;
}

interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: {
    id: string;
    username: string;
    email: string | null;
  };
}

interface Credential {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  maskedValue: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface ClientOrganization {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  organizationType: 'client';
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// API functions with proper auth
async function checkSuperOrgAccess(): Promise {
  const response = await fetch('/api/super-org/check-access', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) return { hasAccess: false };
  return response.json();
}

async function getSuperOrg(): Promise {
  const response = await fetch('/api/super-org', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch super organization');
  return response.json();
}

async function getMembers(): Promise {
  const response = await fetch('/api/super-org/members', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch members');
  return response.json();
}

async function getCredentials(): Promise {
  const response = await fetch('/api/super-org/credentials', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch credentials');
  return response.json();
}

async function getClients(): Promise {
  const response = await fetch('/api/super-org/clients', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch client organizations');
  return response.json();
}

async function getCredentialCategories(): Promise }> {
  const response = await fetch('/api/super-org/credential-categories', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch categories');
  return response.json();
}

// Role badge component
function RoleBadge({ role }: { role: 'owner' | 'admin' | 'member' }) {
  const variants = {
    owner: { icon: Crown, className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    admin: { icon: UserCog, className: 'bg-blue-100 text-blue-800 border-blue-300' },
    member: { icon: User, className: 'bg-gray-100 text-gray-800 border-gray-300' },
  };
  const { icon: Icon, className } = variants[role];

  return (
    
      
      {role.charAt(0).toUpperCase() + role.slice(1)}
    
  );
}

export default function SuperOrgSettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Check access
  const { data: accessData, isLoading: accessLoading } = useQuery({
    queryKey: ['super-org-access'],
    queryFn: checkSuperOrgAccess,
  });

  // Fetch super org data
  const { data: orgData, isLoading: orgLoading } = useQuery({
    queryKey: ['super-org'],
    queryFn: getSuperOrg,
    enabled: accessData?.hasAccess,
  });

  // Fetch members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['super-org-members'],
    queryFn: getMembers,
    enabled: accessData?.hasAccess,
  });

  // Fetch credentials
  const { data: credentialsData, isLoading: credentialsLoading } = useQuery({
    queryKey: ['super-org-credentials'],
    queryFn: getCredentials,
    enabled: accessData?.hasAccess,
  });

  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['super-org-clients'],
    queryFn: getClients,
    enabled: accessData?.hasAccess,
  });

  // Fetch credential categories
  const { data: categoriesData } = useQuery({
    queryKey: ['credential-categories'],
    queryFn: getCredentialCategories,
    enabled: accessData?.hasAccess,
  });

  // Claim ownership mutation - must be before any conditional returns (Rules of Hooks)
  const claimOwnershipMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await fetch('/api/super-org/claim-ownership', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      // Handle non-JSON responses (like error pages)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim ownership');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-access'] });
      toast({ title: 'Ownership claimed successfully', description: 'You now have access to super organization settings.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to claim ownership', description: error.message, variant: 'destructive' });
    },
  });

  // Loading screen
  if (accessLoading) {
    return (
      
        
          
        
      
    );
  }

  if (!accessData?.hasAccess) {
    return (
      
        
          
            
              
                
              
              
                Super Organization Access Required
                
                  You need owner access to the super organization to manage platform settings.
                
                
                  If you are a system admin, you can claim ownership below.
                
              
              
                 setLocation(ROUTES.SETTINGS)}>
                  Back to Settings
                
                 claimOwnershipMutation.mutate()}
                  disabled={claimOwnershipMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {claimOwnershipMutation.isPending ? (
                    <>
                      
                      Claiming...
                    
                  ) : (
                    <>
                      
                      Claim Ownership
                    
                  )}
                
              
            
          
        
      
    );
  }

  const org = orgData?.organization;
  const members = membersData?.members || [];
  const credentials = credentialsData?.credentials || [];
  const clients = clientsData?.organizations || [];
  const categories = categoriesData?.categories || [];

  return (
    
      
        
          
            
            Overview
          
          
            
            Members
          
          
            
            Credentials
          
          
            
            Clients
          
          
            
            Client Organizations
          
        

        {/* Overview Tab */}
        
          
        

        {/* Members Tab */}
        
          
        

        {/* Credentials Tab */}
        
          
        

        {/* Clients Tab */}
        
          
        

        {/* Client Organizations Tab — merged from Organization Manager */}
        
          
        
      
    
  );
}

// Super Org Overview Section with Edit capability
function SuperOrgOverviewSection({
  org,
  members,
  credentials,
  clients,
}: {
  org: SuperOrganization | undefined;
  members: OrganizationMember[];
  credentials: Credential[];
  clients: ClientOrganization[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    domain: '',
    description: '',
    industry: '',
  });

  // Initialize edit data when org loads
  useEffect(() => {
    if (org) {
      setEditData({
        name: org.name || '',
        domain: org.domain || '',
        description: org.description || '',
        industry: org.industry || '',
      });
    }
  }, [org]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editData) => {
      const response = await fetch('/api/super-org', {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update organization');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org'] });
      setIsEditing(false);
      toast({ title: 'Organization updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update organization', variant: 'destructive' });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(editData);
  };

  const handleCancel = () => {
    if (org) {
      setEditData({
        name: org.name || '',
        domain: org.domain || '',
        description: org.description || '',
        industry: org.industry || '',
      });
    }
    setIsEditing(false);
  };

  return (
    <>
      
        
          
            
              
              {org?.name || 'Pivotal B2B'}
            
            
              Platform owner organization - enterprise-level settings and configuration
            
          
          {!isEditing ? (
             setIsEditing(true)}>
              
              Edit
            
          ) : (
            
              
                
                Cancel
              
              
                
                Save
              
            
          )}
        
        
          {isEditing ? (
            
              
                Name
                 setEditData({ ...editData, name: e.target.value })}
                  placeholder="Organization name"
                />
              
              
                Domain
                 setEditData({ ...editData, domain: e.target.value })}
                  placeholder="pivotalb2b.com"
                />
              
              
                Industry
                 setEditData({ ...editData, industry: e.target.value })}
                  placeholder="Technology / B2B Services"
                />
              
              
                Status
                Active
              
              
                Description
                 setEditData({ ...editData, description: e.target.value })}
                  placeholder="Organization description"
                  rows={3}
                />
              
            
          ) : (
            <>
              
                
                  Domain
                  {org?.domain || 'pivotalb2b.com'}
                
                
                  Industry
                  {org?.industry || 'Technology / B2B Services'}
                
                
                  Organization Type
                  Super Organization
                
                
                  Status
                  Active
                
              
              {org?.description && (
                
                  Description
                  {org.description}
                
              )}
            
          )}
        
      

      {/* Quick Stats */}
      
        
          
            
              
                
              
              
                {members.length}
                Team Members
              
            
          
        
        
          
            
              
                
              
              
                {credentials.length}
                API Credentials
              
            
          
        
        
          
            
              
                
              
              
                {clients.length}
                Client Organizations
              
            
          
        
      
    
  );
}

// Members Section Component
function MembersSection({ members, isLoading }: { members: OrganizationMember[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch('/api/super-org/members', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, role }),
      });
      if (!response.ok) throw new Error('Failed to add member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-members'] });
      setAddMemberOpen(false);
      setNewMemberUserId('');
      toast({ title: 'Member added successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to add member', variant: 'destructive' });
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch(`/api/super-org/members/${userId}/role`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error('Failed to update role');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-members'] });
      toast({ title: 'Role updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update role', variant: 'destructive' });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/super-org/members/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to remove member');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-members'] });
      toast({ title: 'Member removed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to remove member', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      
        
          
        
      
    );
  }

  return (
    
      
        
          Organization Members
          
            Manage who has access to super organization settings
          
        
        
          
            
              
              Add Member
            
          
          
            
              Add Organization Member
              
                Add a user as a member of the super organization
              
            
            
              
                User ID
                 setNewMemberUserId(e.target.value)}
                />
              
              
                Role
                 setNewMemberRole(v as any)}>
                  
                    
                  
                  
                    Member
                    Admin
                    Owner
                  
                
              
            
            
               setAddMemberOpen(false)}>
                Cancel
              
               addMemberMutation.mutate({ userId: newMemberUserId, role: newMemberRole })}
                disabled={!newMemberUserId || addMemberMutation.isPending}
              >
                Add Member
              
            
          
        
      
      
        
          
            
              User
              Email
              Role
              Joined
              Actions
            
          
          
            {members.map((member) => (
              
                {member.user.username}
                {member.user.email || '-'}
                
                  
                
                {new Date(member.joinedAt).toLocaleDateString()}
                
                  
                     updateRoleMutation.mutate({ userId: member.userId, role })}
                    >
                      
                        
                      
                      
                        Member
                        Admin
                        Owner
                      
                    
                    
                      
                        
                          
                        
                      
                      
                        
                          Remove Member
                          
                            Are you sure you want to remove {member.user.username} from the super organization?
                          
                        
                        
                          Cancel
                           removeMemberMutation.mutate(member.userId)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Remove
                          
                        
                      
                    
                  
                
              
            ))}
            {members.length === 0 && (
              
                
                  No members found
                
              
            )}
          
        
      
    
  );
}

// Credentials Section Component
function CredentialsSection({
  credentials,
  categories,
  isLoading,
}: {
  credentials: Credential[];
  categories: Array;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addCredentialOpen, setAddCredentialOpen] = useState(false);
  const [showValues, setShowValues] = useState>({});
  const [newCredential, setNewCredential] = useState({
    key: '',
    value: '',
    name: '',
    category: 'other',
    description: '',
  });

  // Add credential mutation
  const addCredentialMutation = useMutation({
    mutationFn: async (data: typeof newCredential) => {
      const response = await fetch('/api/super-org/credentials', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add credential');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-credentials'] });
      setAddCredentialOpen(false);
      setNewCredential({ key: '', value: '', name: '', category: 'other', description: '' });
      toast({ title: 'Credential added successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to add credential', variant: 'destructive' });
    },
  });

  // Delete credential mutation
  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/super-org/credentials/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete credential');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-credentials'] });
      toast({ title: 'Credential deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete credential', variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  if (isLoading) {
    return (
      
        
          
        
      
    );
  }

  // Group credentials by category
  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.category]) acc[cred.category] = [];
    acc[cred.category].push(cred);
    return acc;
  }, {} as Record);

  return (
    
      
        
          
            
              
              API Credentials & Secrets
            
            
              Manage platform-level API keys and credentials securely
            
          
          
            
              
                
                Add Credential
              
            
            
              
                Add New Credential
                
                  Store a new API key or credential securely
                
              
              
                
                  Name
                   setNewCredential({ ...newCredential, name: e.target.value })}
                  />
                
                
                  Key Identifier
                   setNewCredential({ ...newCredential, key: e.target.value.toUpperCase() })}
                  />
                
                
                  Category
                   setNewCredential({ ...newCredential, category: v })}
                  >
                    
                      
                    
                    
                      {categories.map((cat) => (
                        
                          {cat.name}
                        
                      ))}
                    
                  
                
                
                  Value
                   setNewCredential({ ...newCredential, value: e.target.value })}
                  />
                
                
                  Description (optional)
                   setNewCredential({ ...newCredential, description: e.target.value })}
                  />
                
              
              
                 setAddCredentialOpen(false)}>
                  Cancel
                
                 addCredentialMutation.mutate(newCredential)}
                  disabled={!newCredential.key || !newCredential.value || !newCredential.name || addCredentialMutation.isPending}
                >
                  Add Credential
                
              
            
          
        
        
          {Object.keys(groupedCredentials).length === 0 ? (
            
              
              No credentials configured yet
              Add your first API key to get started
            
          ) : (
            
              {Object.entries(groupedCredentials).map(([category, creds]) => (
                
                  
                    {categories.find((c) => c.id === category)?.name || category}
                  
                  
                    
                      
                        Name
                        Key
                        Value
                        Last Used
                        Actions
                      
                    
                    
                      {creds.map((cred) => (
                        
                          {cred.name}
                          
                            {cred.key}
                          
                          
                            
                              
                                {showValues[cred.id] ? cred.maskedValue : '••••••••'}
                              
                               setShowValues({ ...showValues, [cred.id]: !showValues[cred.id] })}
                              >
                                {showValues[cred.id] ? (
                                  
                                ) : (
                                  
                                )}
                              
                            
                          
                          
                            {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleDateString() : 'Never'}
                          
                          
                            
                               copyToClipboard(cred.key)}
                              >
                                
                              
                              
                                
                                  
                                    
                                  
                                
                                
                                  
                                    Delete Credential
                                    
                                      Are you sure you want to delete "{cred.name}"? This action cannot be undone.
                                    
                                  
                                  
                                    Cancel
                                     deleteCredentialMutation.mutate(cred.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    
                                  
                                
                              
                            
                          
                        
                      ))}
                    
                  
                
              ))}
            
          )}
        
      

      
        
          
            
            
              Security Notice
              
                Credentials are encrypted at rest and only accessible by super organization owners.
                Never share these values or expose them in client-side code.
              
            
          
        
      
    
  );
}

// Clients Section Component
function ClientsSection({ clients, isLoading }: { clients: ClientOrganization[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [newClient, setNewClient] = useState({
    name: '',
    domain: '',
    description: '',
    industry: '',
  });
  const [editClient, setEditClient] = useState({
    name: '',
    domain: '',
    description: '',
    industry: '',
  });

  // Add client mutation
  const addClientMutation = useMutation({
    mutationFn: async (data: typeof newClient) => {
      const response = await fetch('/api/super-org/clients', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create client');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-clients'] });
      setAddClientOpen(false);
      setNewClient({ name: '', domain: '', description: '', industry: '' });
      toast({ title: 'Client organization created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create client organization', variant: 'destructive' });
    },
  });

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editClient }) => {
      const response = await fetch(`/api/super-org/clients/${id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update client');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-clients'] });
      setEditClientOpen(false);
      setEditingClient(null);
      toast({ title: 'Client organization updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update client organization', variant: 'destructive' });
    },
  });

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/super-org/clients/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete client');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-org-clients'] });
      toast({ title: 'Client organization deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete client organization', variant: 'destructive' });
    },
  });

  const handleEditClick = (client: ClientOrganization) => {
    setEditingClient(client);
    setEditClient({
      name: client.name || '',
      domain: client.domain || '',
      description: client.description || '',
      industry: client.industry || '',
    });
    setEditClientOpen(true);
  };

  if (isLoading) {
    return (
      
        
          
        
      
    );
  }

  return (
    
      
        
          Client Organizations
          
            Organizations that use the platform services
          
        
        
          
            
              
              Add Client
            
          
          
            
              Create Client Organization
              
                Add a new client organization under Pivotal B2B
              
            
            
              
                Organization Name *
                 setNewClient({ ...newClient, name: e.target.value })}
                />
              
              
                Domain
                 setNewClient({ ...newClient, domain: e.target.value })}
                />
              
              
                Industry
                 setNewClient({ ...newClient, industry: e.target.value })}
                />
              
              
                Description
                 setNewClient({ ...newClient, description: e.target.value })}
                />
              
            
            
               setAddClientOpen(false)}>
                Cancel
              
               addClientMutation.mutate(newClient)}
                disabled={!newClient.name || addClientMutation.isPending}
              >
                Create Client
              
            
          
        
      
      
        {clients.length === 0 ? (
          
            
            No client organizations yet
            Add your first client to get started
          
        ) : (
          
            
              
                Organization
                Domain
                Industry
                Status
                Created
                Actions
              
            
            
              {clients.map((client) => (
                
                  
                    
                      
                      {client.name}
                    
                  
                  {client.domain || '-'}
                  {client.industry || '-'}
                  
                    
                      {client.isActive ? 'Active' : 'Inactive'}
                    
                  
                  {new Date(client.createdAt).toLocaleDateString()}
                  
                    
                       handleEditClick(client)}
                      >
                        
                      
                      
                        
                          
                            
                          
                        
                        
                          
                            Delete Organization
                            
                              Are you sure you want to delete "{client.name}"? This will deactivate the organization.
                            
                          
                          
                            Cancel
                             deleteClientMutation.mutate(client.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            
                          
                        
                      
                    
                  
                
              ))}
            
          
        )}
      

      {/* Edit Client Dialog */}
      
        
          
            Edit Client Organization
            
              Update the details for {editingClient?.name}
            
          
          
            
              Organization Name *
               setEditClient({ ...editClient, name: e.target.value })}
              />
            
            
              Domain
               setEditClient({ ...editClient, domain: e.target.value })}
              />
            
            
              Industry
               setEditClient({ ...editClient, industry: e.target.value })}
              />
            
            
              Description
               setEditClient({ ...editClient, description: e.target.value })}
              />
            
          
          
             setEditClientOpen(false)}>
              Cancel
            
             editingClient && updateClientMutation.mutate({ id: editingClient.id, data: editClient })}
              disabled={!editClient.name || updateClientMutation.isPending}
            >
              Save Changes
            
          
        
      
    
  );
}

// Client Organizations Section — merged from Organization Manager
function ClientOrganizationsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [deletingOrg, setDeletingOrg] = useState(null);
  const [detailOrg, setDetailOrg] = useState(null);
  const [membersOrg, setMembersOrg] = useState(null);

  const { data: orgsData, isLoading: orgsLoading } = useQuery({
    queryKey: ['/api/organizations', typeFilter, activeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
      if (activeFilter && activeFilter !== 'all') params.set('active', activeFilter === 'active' ? 'true' : 'false');
      if (searchQuery) params.set('search', searchQuery);
      const url = `/api/organizations${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, { headers: getAuthHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch organizations');
      return res.json() as Promise;
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/organizations/stats'],
    queryFn: async () => {
      const res = await fetch('/api/organizations/stats', { headers: getAuthHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json() as Promise;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await fetch(`/api/organizations/${orgId}`, { method: 'DELETE', headers: getAuthHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete organization');
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
    <>
      
        
          Client Organizations
          Organizations that use the platform services
        
         setCreateDialogOpen(true)}>
          
          New Organization
        
      

      {stats && (
        
          
            
              Total
              
            
            
              {stats.total}
              {stats.active} active
            
          
          
            
              Super
              
            
            
              {stats.byType.super}
            
          
          
            
              Client
              
            
            
              {stats.byType.client}
            
          
          
            
              Campaign
              
            
            
              {stats.byType.campaign}
            
          
        
      )}

      
        
          
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
          
        
      

      {orgsLoading ? (
        
          
        
      ) : (
         setEditingOrg(org)}
          onDelete={(org) => setDeletingOrg(org)}
          onViewMembers={(org) => setMembersOrg(org)}
          onViewDetails={(org) => setDetailOrg(org)}
        />
      )}

      
       { if (!open) setEditingOrg(null); }}
        organization={editingOrg}
      />
       { if (!open) setDetailOrg(null); }}
        organization={detailOrg}
        onEdit={(org) => { setDetailOrg(null); setEditingOrg(org); }}
        onViewMembers={(org) => { setDetailOrg(null); setMembersOrg(org); }}
      />
       { if (!open) setMembersOrg(null); }}
        organization={membersOrg}
      />
       setDeletingOrg(null)}>
        
          
            Delete Organization
            
              Are you sure you want to delete {deletingOrg?.name}? This will
              deactivate the organization. It can be reactivated later.
            
          
          
            Cancel
             { if (deletingOrg) deleteMutation.mutate(deletingOrg.id); }}
            >
              Delete
            
          
        
      
    
  );
}