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
  const [selectedRole, setSelectedRole] = useState(null);
  const [newRole, setNewRole] = useState({ name: '', description: '' });

  // Fetch roles
  const { data: roles, isLoading } = useQuery({
    queryKey: ['/api/iam/roles'],
  });

  // Fetch policies for policy picker
  const { data: policies } = useQuery({
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
    
      {/* Header */}
      
        
          
            
          
        
        
          Roles
          
            Define roles that group permissions together
          
        
         setShowCreateModal(true)}>
          
          Create Role
        
      

      {/* Search */}
      
        
          
            
             setSearchQuery(e.target.value)}
              className="pl-10"
            />
          
        
      

      {isLoading ? (
        
          {[1, 2, 3].map(i => )}
        
      ) : (
        
          {/* System Roles */}
          {systemRoles && systemRoles.length > 0 && (
            
              
                
                  
                  System Roles
                
                
                  Built-in roles that cannot be modified
                
              
              
                
                  
                    
                      Role Name
                      Description
                      Created
                      Actions
                    
                  
                  
                    {systemRoles.map((role) => (
                      
                        
                          
                            
                            {role.name}
                            
                              
                              System
                            
                          
                        
                        
                          {role.description || 'No description'}
                        
                        
                          {new Date(role.createdAt).toLocaleDateString()}
                        
                        
                           {
                              setSelectedRole(role);
                              setShowPoliciesModal(true);
                            }}
                          >
                            
                            View Policies
                          
                        
                      
                    ))}
                  
                
              
            
          )}

          {/* Custom Roles */}
          
            
              Custom Roles
              
                User-defined roles with custom permission sets
              
            
            
              {customRoles && customRoles.length > 0 ? (
                
                  
                    
                      Role Name
                      Description
                      Created
                      Actions
                    
                  
                  
                    {customRoles.map((role) => (
                      
                        
                          
                            
                            {role.name}
                          
                        
                        
                          {role.description || 'No description'}
                        
                        
                          {new Date(role.createdAt).toLocaleDateString()}
                        
                        
                          
                            
                              
                                
                              
                            
                            
                               {
                                setSelectedRole(role);
                                setShowPoliciesModal(true);
                              }}>
                                
                                Manage Policies
                              
                              
                                
                                View Assigned Users
                              
                              
                              
                                
                                Edit Role
                              
                              
                                
                                Delete Role
                              
                            
                          
                        
                      
                    ))}
                  
                
              ) : (
                
                  
                  No custom roles yet
                  
                    Create custom roles to define specific permission sets
                  
                   setShowCreateModal(true)}>
                    
                    Create Role
                  
                
              )}
            
          
        
      )}

      {/* Create Role Modal */}
      
        
          
            Create Role
            
              Create a new role to group permissions
            
          
          
          
            
              Role Name
               setNewRole({ ...newRole, name: e.target.value })}
                placeholder="e.g., Campaign Manager, Report Viewer"
              />
            
            
              Description
               setNewRole({ ...newRole, description: e.target.value })}
                placeholder="What permissions does this role grant?"
              />
            
          
          
          
             setShowCreateModal(false)}>
              Cancel
            
             createRoleMutation.mutate(newRole)}
              disabled={!newRole.name || createRoleMutation.isPending}
            >
              {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
            
          
        
      

      {/* Manage Policies Modal */}
      
        
          
            Policies for {selectedRole?.name}
            
              Policies attached to this role define what permissions users with this role have
            
          
          
          {policies && policies.length > 0 ? (
            
              
                
                  Policy Name
                  Entity Type
                  Actions
                  Scope
                
              
              
                {policies.slice(0, 10).map((policy) => (
                  
                    {policy.name}
                    
                      {policy.entityType}
                    
                    
                      
                        {policy.actions.slice(0, 3).map(action => (
                          
                            {action}
                          
                        ))}
                        {policy.actions.length > 3 && (
                          
                            +{policy.actions.length - 3} more
                          
                        )}
                      
                    
                    
                      {policy.scopeType}
                    
                  
                ))}
              
            
          ) : (
            
              No policies attached to this role
            
          )}
          
          
             setShowPoliciesModal(false)}>
              Close
            
            {!selectedRole?.isSystem && (
              
                
                Attach Policy
              
            )}
          
        
      
    
  );
}