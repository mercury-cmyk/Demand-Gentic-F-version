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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

// Available system roles (must match userRoleEnum in schema.ts)
const SYSTEM_ROLES = [
  { id: 'admin', name: 'Admin', description: 'Full system access' },
  { id: 'campaign_manager', name: 'Campaign Manager', description: 'Manage campaigns, analytics, pipeline, and conversation quality' },
  { id: 'quality_analyst', name: 'Quality Analyst', description: 'QA review, leads, call recordings, and reports' },
  { id: 'agent', name: 'Agent', description: 'Agent console, leads review, and dashboard' },
  { id: 'data_ops', name: 'Data Ops', description: 'Data management, accounts, contacts, and verification' },
  { id: 'content_creator', name: 'Content Creator', description: 'Content creation and marketing' },
];

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string; // Legacy single role
  roles?: string[]; // Multi-role support
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
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedRoles, setSelectedRoles] = useState([]);

  // Fetch users from existing endpoint
  const { data: users, isLoading } = useQuery({
    queryKey: ['/api/users'],
  });

  // Fetch IAM roles
  const { data: roles } = useQuery({
    queryKey: ['/api/iam/roles'],
  });

  // Fetch effective permissions for selected user
  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['/api/iam/users', selectedUser?.id, 'permissions'],
    enabled: !!selectedUser && showPermissionsModal,
  });

  // Mutation to assign IAM role (advanced permissions)
  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const res = await fetch(`/api/iam/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to assign role');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setShowAssignRoleModal(false);
      setSelectedRole('');
      setSelectedUser(null);
    },
  });

  // Mutation to update system roles (multi-role support)
  const updateRolesMutation = useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: string[] }) => {
      const res = await fetch(`/api/users/${userId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roles }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update roles');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      setShowAssignRoleModal(false);
      setSelectedRoles([]);
      setSelectedUser(null);
      toast({
        title: 'Roles Updated',
        description: 'User roles have been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
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
      case 'campaign_manager': return 'default';
      case 'quality_analyst': return 'default';
      case 'agent': return 'secondary';
      case 'data_ops': return 'outline';
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
    
      {/* Header */}
      
        
          
            
          
        
        
          Users
          
            Manage user accounts and their access permissions
          
        
        
          
            
            Manage Users
          
        
      

      {/* Search & Filters */}
      
        
          
            
              
               setSearchQuery(e.target.value)}
                className="pl-10"
              />
            
          
        
      

      {/* Users Table */}
      
        
          All Users
          
            {filteredUsers?.length ?? 0} users in system
          
        
        
          {isLoading ? (
            
              {[1, 2, 3, 4, 5].map(i => (
                
              ))}
            
          ) : (
            
              
                
                  User
                  Role
                  Status
                  Last Login
                  Actions
                
              
              
                {filteredUsers?.map((user) => (
                  
                    
                      
                        
                          {getInitials(user)}
                        
                        
                          
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}`
                              : user.username
                            }
                          
                          
                            
                            {user.email}
                          
                        
                      
                    
                    
                      
                        {(user.roles && user.roles.length > 0 ? user.roles : [user.role]).map((role) => (
                          
                            {role.replace(/_/g, ' ')}
                          
                        ))}
                      
                    
                    
                      {user.isActive !== false ? (
                        
                          
                          Active
                        
                      ) : (
                        
                          
                          Inactive
                        
                      )}
                    
                    
                      {user.lastLogin 
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : 'Never'
                      }
                    
                    
                      
                        
                          
                            
                          
                        
                        
                          Actions
                          
                           {
                            setSelectedUser(user);
                            setShowPermissionsModal(true);
                          }}>
                            
                            View Effective Permissions
                          
                           {
                            setSelectedUser(user);
                            // Initialize with current roles
                            const currentRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
                            setSelectedRoles(currentRoles);
                            setShowAssignRoleModal(true);
                          }}>
                            
                            Manage Roles
                          
                          
                            
                              
                              View Grants
                            
                          
                        
                      
                    
                  
                ))}
              
            
          )}
        
      

      {/* Effective Permissions Modal */}
      
        
          
            Effective Permissions
            
              All permissions for {selectedUser?.username}
            
          
          
          {permissionsLoading ? (
            
              {[1, 2, 3, 4, 5].map(i => (
                
              ))}
            
          ) : permissions && permissions.length > 0 ? (
            
              
                
                  Entity Type
                  Action
                  Scope
                  Source
                
              
              
                {permissions.map((perm, idx) => (
                  
                    
                      {perm.entityType}
                    
                    
                      {perm.action}
                    
                    
                      {perm.scope}
                    
                    
                      
                        {perm.source}: {perm.sourceName}
                      
                    
                  
                ))}
              
            
          ) : (
            
              No permissions found for this user
            
          )}
        
      

      {/* Manage Roles Modal */}
       {
        setShowAssignRoleModal(open);
        if (!open) {
          setSelectedRoles([]);
          setSelectedUser(null);
        }
      }}>
        
          
            Manage User Roles
            
              Select the roles for {selectedUser?.firstName || selectedUser?.username}.
              Users can have multiple roles to access different parts of the application.
            
          

          
            
              System Roles
              
                {SYSTEM_ROLES.map((role) => (
                  
                     {
                        if (checked) {
                          setSelectedRoles([...selectedRoles, role.id]);
                        } else {
                          setSelectedRoles(selectedRoles.filter(r => r !== role.id));
                        }
                      }}
                    />
                    
                      
                        {role.name}
                      
                      
                        {role.description}
                      
                    
                  
                ))}
              
              {selectedRoles.length === 0 && (
                
                  Please select at least one role
                
              )}
            

            
               setShowAssignRoleModal(false)}>
                Cancel
              
               {
                  if (selectedUser && selectedRoles.length > 0) {
                    updateRolesMutation.mutate({ userId: selectedUser.id, roles: selectedRoles });
                  }
                }}
              >
                {updateRolesMutation.isPending ? 'Saving...' : 'Save Roles'}
              
            
          
        
      
    
  );
}