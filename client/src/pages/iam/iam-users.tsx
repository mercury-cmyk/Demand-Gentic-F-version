/**
 * IAM Users Page
 * 
 * List and manage users with their roles and effective permissions
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Users, Search, MoreHorizontal, Eye, Shield, UserPlus, 
  Key, ChevronLeft, Mail, CheckCircle, XCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
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

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface EffectivePermission {
  entityType: string;
  action: string;
  scope: string;
  source: 'role' | 'grant' | 'team';
  sourceName: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
}

export default function IamUsers() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');

  // Fetch users from existing endpoint
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

  // Fetch IAM roles
  const { data: roles } = useQuery<Role[]>({
    queryKey: ['/api/iam/roles'],
  });

  // Fetch effective permissions for selected user
  const { data: permissions, isLoading: permissionsLoading } = useQuery<EffectivePermission[]>({
    queryKey: ['/api/iam/users', selectedUser?.id, 'permissions'],
    enabled: !!selectedUser && showPermissionsModal,
  });

  const filteredUsers = users?.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.firstName?.toLowerCase().includes(query) ||
      user.lastName?.toLowerCase().includes(query)
    );
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'quality_analyst': return 'default';
      case 'agent': return 'secondary';
      case 'content_creator': return 'outline';
      default: return 'secondary';
    }
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.username.slice(0, 2).toUpperCase();
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and their access permissions
          </p>
        </div>
        <Link href="/user-management">
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Manage Users
          </Button>
        </Link>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {filteredUsers?.length ?? 0} users in system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(user)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}`
                              : user.username
                            }
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {user.role.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.isActive !== false ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastLogin 
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setShowPermissionsModal(true);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Effective Permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setShowAssignRoleModal(true);
                          }}>
                            <Shield className="h-4 w-4 mr-2" />
                            Assign IAM Role
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/iam/grants?userId=${user.id}`}>
                              <Key className="h-4 w-4 mr-2" />
                              View Grants
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Effective Permissions Modal */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Effective Permissions</DialogTitle>
            <DialogDescription>
              All permissions for {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          
          {permissionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : permissions && permissions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline">{perm.entityType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{perm.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {perm.scope}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {perm.source}: {perm.sourceName}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No permissions found for this user
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Role Modal */}
      <Dialog open={showAssignRoleModal} onOpenChange={setShowAssignRoleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign IAM Role</DialogTitle>
            <DialogDescription>
              Assign an IAM role to {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Select Role</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role..." />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map(role => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                      {role.description && (
                        <span className="text-muted-foreground ml-2">
                          - {role.description}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAssignRoleModal(false)}>
                Cancel
              </Button>
              <Button disabled={!selectedRole}>
                Assign Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
