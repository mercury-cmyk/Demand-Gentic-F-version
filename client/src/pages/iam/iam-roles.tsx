/**
 * IAM Roles Page
 * 
 * Manage roles and their associated policies
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Shield, Search, Plus, MoreHorizontal, FileText, 
  ChevronLeft, Edit, Trash2, Lock, Users
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Role {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

interface Policy {
  id: string;
  name: string;
  entityType: string;
  actions: string[];
  scopeType: string;
}

export default function IamRoles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [newRole, setNewRole] = useState({ name: '', description: '' });

  // Fetch roles
  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ['/api/iam/roles'],
  });

  // Fetch policies for policy picker
  const { data: policies } = useQuery<Policy[]>({
    queryKey: ['/api/iam/policies'],
    enabled: showPoliciesModal,
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch('/api/iam/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/roles'] });
      setShowCreateModal(false);
      setNewRole({ name: '', description: '' });
      toast({ title: 'Role created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create role', variant: 'destructive' });
    },
  });

  const filteredRoles = roles?.filter(role => 
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate system roles from custom roles
  const systemRoles = filteredRoles?.filter(r => r.isSystem);
  const customRoles = filteredRoles?.filter(r => !r.isSystem);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Roles</h1>
          <p className="text-muted-foreground">
            Define roles that group permissions together
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* System Roles */}
          {systemRoles && systemRoles.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>System Roles</CardTitle>
                </div>
                <CardDescription>
                  Built-in roles that cannot be modified
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {systemRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-medium">{role.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              System
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {role.description || 'No description'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedRole(role);
                              setShowPoliciesModal(true);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            View Policies
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Custom Roles */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Roles</CardTitle>
              <CardDescription>
                User-defined roles with custom permission sets
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customRoles && customRoles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <span className="font-medium">{role.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {role.description || 'No description'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(role.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => {
                                setSelectedRole(role);
                                setShowPoliciesModal(true);
                              }}>
                                <FileText className="h-4 w-4 mr-2" />
                                Manage Policies
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Users className="h-4 w-4 mr-2" />
                                View Assigned Users
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Role
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Role
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No custom roles yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create custom roles to define specific permission sets
                  </p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Role
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Role Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Create a new role to group permissions
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="role-name">Role Name</Label>
              <Input
                id="role-name"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="e.g., Campaign Manager, Report Viewer"
              />
            </div>
            <div>
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                placeholder="What permissions does this role grant?"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createRoleMutation.mutate(newRole)}
              disabled={!newRole.name || createRoleMutation.isPending}
            >
              {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Policies Modal */}
      <Dialog open={showPoliciesModal} onOpenChange={setShowPoliciesModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Policies for {selectedRole?.name}</DialogTitle>
            <DialogDescription>
              Policies attached to this role define what permissions users with this role have
            </DialogDescription>
          </DialogHeader>
          
          {policies && policies.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Name</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Scope</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.slice(0, 10).map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{policy.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{policy.entityType}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {policy.actions.slice(0, 3).map(action => (
                          <Badge key={action} variant="secondary" className="text-xs">
                            {action}
                          </Badge>
                        ))}
                        {policy.actions.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{policy.actions.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {policy.scopeType}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No policies attached to this role
            </p>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPoliciesModal(false)}>
              Close
            </Button>
            {!selectedRole?.isSystem && (
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Attach Policy
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
