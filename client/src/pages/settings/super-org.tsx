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
import { ROUTES } from '@/lib/routes';

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
async function checkSuperOrgAccess(): Promise<{ hasAccess: boolean }> {
  const response = await fetch('/api/super-org/check-access', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) return { hasAccess: false };
  return response.json();
}

async function getSuperOrg(): Promise<{ organization: SuperOrganization }> {
  const response = await fetch('/api/super-org', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch super organization');
  return response.json();
}

async function getMembers(): Promise<{ members: OrganizationMember[] }> {
  const response = await fetch('/api/super-org/members', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch members');
  return response.json();
}

async function getCredentials(): Promise<{ credentials: Credential[] }> {
  const response = await fetch('/api/super-org/credentials', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch credentials');
  return response.json();
}

async function getClients(): Promise<{ organizations: ClientOrganization[] }> {
  const response = await fetch('/api/super-org/clients', {
    headers: getAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch client organizations');
  return response.json();
}

async function getCredentialCategories(): Promise<{ categories: Array<{ id: string; name: string; description: string }> }> {
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
    <Badge variant="outline" className={className}>
      <Icon className="h-3 w-3 mr-1" />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
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
      <SettingsLayout title="Super Organization" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  if (!accessData?.hasAccess) {
    return (
      <SettingsLayout title="Platform Admin" description="Super organization management">
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 rounded-full bg-amber-100">
                <Crown className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Super Organization Access Required</h3>
                <p className="text-muted-foreground mt-1">
                  You need owner access to the super organization to manage platform settings.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  If you are a system admin, you can claim ownership below.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setLocation(ROUTES.SETTINGS)}>
                  Back to Settings
                </Button>
                <Button
                  onClick={() => claimOwnershipMutation.mutate()}
                  disabled={claimOwnershipMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {claimOwnershipMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Claim Ownership
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </SettingsLayout>
    );
  }

  const org = orgData?.organization;
  const members = membersData?.members || [];
  const credentials = credentialsData?.credentials || [];
  const clients = clientsData?.organizations || [];
  const categories = categoriesData?.categories || [];

  return (
    <SettingsLayout
      title="Super Organization"
      description="Manage Pivotal B2B platform settings, members, and credentials"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="credentials" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Credentials
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Clients
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <SuperOrgOverviewSection org={org} members={members} credentials={credentials} clients={clients} />
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          <MembersSection members={members} isLoading={membersLoading} />
        </TabsContent>

        {/* Credentials Tab */}
        <TabsContent value="credentials" className="space-y-6">
          <CredentialsSection
            credentials={credentials}
            categories={categories}
            isLoading={credentialsLoading}
          />
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-6">
          <ClientsSection clients={clients} isLoading={clientsLoading} />
        </TabsContent>
      </Tabs>
    </SettingsLayout>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              {org?.name || 'Pivotal B2B'}
            </CardTitle>
            <CardDescription>
              Platform owner organization - enterprise-level settings and configuration
            </CardDescription>
          </div>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  placeholder="Organization name"
                />
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input
                  value={editData.domain}
                  onChange={(e) => setEditData({ ...editData, domain: e.target.value })}
                  placeholder="pivotalb2b.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  value={editData.industry}
                  onChange={(e) => setEditData({ ...editData, industry: e.target.value })}
                  placeholder="Technology / B2B Services"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Badge variant="outline" className="mt-1 bg-green-100 text-green-800">Active</Badge>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  placeholder="Organization description"
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Domain</Label>
                  <p className="font-medium">{org?.domain || 'pivotalb2b.com'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Industry</Label>
                  <p className="font-medium">{org?.industry || 'Technology / B2B Services'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Organization Type</Label>
                  <Badge variant="default" className="mt-1">Super Organization</Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant="outline" className="mt-1 bg-green-100 text-green-800">Active</Badge>
                </div>
              </div>
              {org?.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="text-sm mt-1">{org.description}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{members.length}</p>
                <p className="text-sm text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Key className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{credentials.length}</p>
                <p className="text-sm text-muted-foreground">API Credentials</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Building className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{clients.length}</p>
                <p className="text-sm text-muted-foreground">Client Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// Members Section Component
function MembersSection({ members, isLoading }: { members: OrganizationMember[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'owner' | 'admin' | 'member'>('member');

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
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Organization Members</CardTitle>
          <CardDescription>
            Manage who has access to super organization settings
          </CardDescription>
        </div>
        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Organization Member</DialogTitle>
              <DialogDescription>
                Add a user as a member of the super organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input
                  placeholder="Enter user ID"
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMemberMutation.mutate({ userId: newMemberUserId, role: newMemberRole })}
                disabled={!newMemberUserId || addMemberMutation.isPending}
              >
                Add Member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.user.username}</TableCell>
                <TableCell>{member.user.email || '-'}</TableCell>
                <TableCell>
                  <RoleBadge role={member.role} />
                </TableCell>
                <TableCell>{new Date(member.joinedAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(role) => updateRoleMutation.mutate({ userId: member.userId, role })}
                    >
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Member</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove {member.user.username} from the super organization?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeMemberMutation.mutate(member.userId)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No members found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Credentials Section Component
function CredentialsSection({
  credentials,
  categories,
  isLoading,
}: {
  credentials: Credential[];
  categories: Array<{ id: string; name: string; description: string }>;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addCredentialOpen, setAddCredentialOpen] = useState(false);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
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
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Group credentials by category
  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.category]) acc[cred.category] = [];
    acc[cred.category].push(cred);
    return acc;
  }, {} as Record<string, Credential[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Credentials & Secrets
            </CardTitle>
            <CardDescription>
              Manage platform-level API keys and credentials securely
            </CardDescription>
          </div>
          <Dialog open={addCredentialOpen} onOpenChange={setAddCredentialOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Credential
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Credential</DialogTitle>
                <DialogDescription>
                  Store a new API key or credential securely
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., OpenAI Production Key"
                    value={newCredential.name}
                    onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Key Identifier</Label>
                  <Input
                    placeholder="e.g., OPENAI_API_KEY"
                    value={newCredential.key}
                    onChange={(e) => setNewCredential({ ...newCredential, key: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={newCredential.category}
                    onValueChange={(v) => setNewCredential({ ...newCredential, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input
                    type="password"
                    placeholder="Enter the credential value"
                    value={newCredential.value}
                    onChange={(e) => setNewCredential({ ...newCredential, value: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    placeholder="What is this credential used for?"
                    value={newCredential.description}
                    onChange={(e) => setNewCredential({ ...newCredential, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddCredentialOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => addCredentialMutation.mutate(newCredential)}
                  disabled={!newCredential.key || !newCredential.value || !newCredential.name || addCredentialMutation.isPending}
                >
                  Add Credential
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedCredentials).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No credentials configured yet</p>
              <p className="text-sm mt-1">Add your first API key to get started</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedCredentials).map(([category, creds]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {categories.find((c) => c.id === category)?.name || category}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creds.map((cred) => (
                        <TableRow key={cred.id}>
                          <TableCell className="font-medium">{cred.name}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{cred.key}</code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {showValues[cred.id] ? cred.maskedValue : '••••••••'}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setShowValues({ ...showValues, [cred.id]: !showValues[cred.id] })}
                              >
                                {showValues[cred.id] ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleDateString() : 'Never'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyToClipboard(cred.key)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Credential</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{cred.name}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteCredentialMutation.mutate(cred.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-800">Security Notice</p>
              <p className="text-sm text-yellow-700 mt-1">
                Credentials are encrypted at rest and only accessible by super organization owners.
                Never share these values or expose them in client-side code.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Clients Section Component
function ClientsSection({ clients, isLoading }: { clients: ClientOrganization[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientOrganization | null>(null);
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
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Client Organizations</CardTitle>
          <CardDescription>
            Organizations that use the platform services
          </CardDescription>
        </div>
        <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Client Organization</DialogTitle>
              <DialogDescription>
                Add a new client organization under Pivotal B2B
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Organization Name *</Label>
                <Input
                  placeholder="e.g., Acme Corp"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input
                  placeholder="e.g., acmecorp.com"
                  value={newClient.domain}
                  onChange={(e) => setNewClient({ ...newClient, domain: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  placeholder="e.g., Technology"
                  value={newClient.industry}
                  onChange={(e) => setNewClient({ ...newClient, industry: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Brief description of the organization"
                  value={newClient.description}
                  onChange={(e) => setNewClient({ ...newClient, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddClientOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addClientMutation.mutate(newClient)}
                disabled={!newClient.name || addClientMutation.isPending}
              >
                Create Client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No client organizations yet</p>
            <p className="text-sm mt-1">Add your first client to get started</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      {client.name}
                    </div>
                  </TableCell>
                  <TableCell>{client.domain || '-'}</TableCell>
                  <TableCell>{client.industry || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={client.isActive ? 'default' : 'secondary'}>
                      {client.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditClick(client)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{client.name}"? This will deactivate the organization.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteClientMutation.mutate(client.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit Client Dialog */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client Organization</DialogTitle>
            <DialogDescription>
              Update the details for {editingClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Organization Name *</Label>
              <Input
                placeholder="e.g., Acme Corp"
                value={editClient.name}
                onChange={(e) => setEditClient({ ...editClient, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input
                placeholder="e.g., acmecorp.com"
                value={editClient.domain}
                onChange={(e) => setEditClient({ ...editClient, domain: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Input
                placeholder="e.g., Technology"
                value={editClient.industry}
                onChange={(e) => setEditClient({ ...editClient, industry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the organization"
                value={editClient.description}
                onChange={(e) => setEditClient({ ...editClient, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => editingClient && updateClientMutation.mutate({ id: editingClient.id, data: editClient })}
              disabled={!editClient.name || updateClientMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
