/**
 * IAM Policies Page
 * 
 * Create and manage permission policies
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  FileText, Search, Plus, MoreHorizontal, Lock, 
  ChevronLeft, Edit, Trash2, Shield, Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Policy {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  entityType: string;
  actions: string[];
  scopeType: string;
  conditions?: Record;
  effect: 'allow' | 'deny';
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
}

const ENTITY_TYPES = [
  'account', 'project', 'campaign', 'agent', 'call_session',
  'recording', 'transcript', 'report', 'lead', 'delivery',
  'domain', 'smtp', 'email_template', 'prompt', 'quality_review',
  'audit_log', 'user', 'team', 'role', 'policy'
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'run', 'execute',
  'approve', 'publish', 'assign', 'export', 'manage_settings',
  'view_sensitive', 'manage_access'
];

const SCOPE_TYPES = [
  { value: 'all', label: 'All Resources' },
  { value: 'own', label: 'Own Resources Only' },
  { value: 'assigned', label: 'Assigned Resources' },
  { value: 'team', label: 'Team Resources' },
  { value: 'organization', label: 'Organization' },
  { value: 'hierarchy', label: 'Hierarchy (Parent/Child)' },
  { value: 'project', label: 'Project Scope' },
  { value: 'department', label: 'Department' },
];

export default function IamPolicies() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    description: '',
    entityType: '',
    actions: [] as string[],
    scopeType: 'all',
    effect: 'allow' as 'allow' | 'deny',
  });

  // Fetch policies
  const { data: policies, isLoading } = useQuery({
    queryKey: ['/api/iam/policies'],
  });

  // Create policy mutation
  const createPolicyMutation = useMutation({
    mutationFn: async (data: typeof newPolicy) => {
      const res = await fetch('/api/iam/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create policy');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/policies'] });
      setShowCreateModal(false);
      resetNewPolicy();
      toast({ title: 'Policy created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create policy', variant: 'destructive' });
    },
  });

  const resetNewPolicy = () => {
    setNewPolicy({
      name: '',
      description: '',
      entityType: '',
      actions: [],
      scopeType: 'all',
      effect: 'allow',
    });
  };

  const toggleAction = (action: string) => {
    setNewPolicy(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const filteredPolicies = policies?.filter(policy => 
    policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    policy.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    policy.entityType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const systemPolicies = filteredPolicies?.filter(p => p.isSystem);
  const customPolicies = filteredPolicies?.filter(p => !p.isSystem);

  const getEffectBadge = (effect: string) => {
    return effect === 'deny' 
      ? Deny
      : Allow;
  };

  return (
    
      {/* Header */}
      
        
          
            
          
        
        
          Policies
          
            Define fine-grained permission policies for entities
          
        
         setShowCreateModal(true)}>
          
          Create Policy
        
      

      {/* Search */}
      
        
          
            
             setSearchQuery(e.target.value)}
              className="pl-10"
            />
          
        
      

      {isLoading ? (
        
          {[1, 2, 3].map(i => )}
        
      ) : (
        
          {/* System Policies */}
          {systemPolicies && systemPolicies.length > 0 && (
            
              
                
                  
                  System Policies
                
                
                  Built-in policies for common access patterns
                
              
              
                
                  
                    
                      Policy Name
                      Entity
                      Actions
                      Scope
                      Effect
                      View
                    
                  
                  
                    {systemPolicies.map((policy) => (
                      
                        
                          
                            
                            {policy.name}
                            
                              
                              System
                            
                          
                        
                        
                          {policy.entityType}
                        
                        
                          
                            {policy.actions.slice(0, 2).map(action => (
                              
                                {action}
                              
                            ))}
                            {policy.actions.length > 2 && (
                              
                                +{policy.actions.length - 2}
                              
                            )}
                          
                        
                        
                          {policy.scopeType}
                        
                        
                          {getEffectBadge(policy.effect)}
                        
                        
                           {
                              setSelectedPolicy(policy);
                              setShowDetailsModal(true);
                            }}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            
          )}

          {/* Custom Policies */}
          
            
              Custom Policies
              
                User-defined policies for specific access requirements
              
            
            
              {customPolicies && customPolicies.length > 0 ? (
                
                  
                    
                      Policy Name
                      Entity
                      Actions
                      Scope
                      Effect
                      Actions
                    
                  
                  
                    {customPolicies.map((policy) => (
                      
                        
                          
                            
                            {policy.name}
                          
                        
                        
                          {policy.entityType}
                        
                        
                          
                            {policy.actions.slice(0, 2).map(action => (
                              
                                {action}
                              
                            ))}
                            {policy.actions.length > 2 && (
                              
                                +{policy.actions.length - 2}
                              
                            )}
                          
                        
                        
                          {policy.scopeType}
                        
                        
                          {getEffectBadge(policy.effect)}
                        
                        
                          
                            
                              
                                
                              
                            
                            
                               {
                                setSelectedPolicy(policy);
                                setShowDetailsModal(true);
                              }}>
                                
                                View Details
                              
                              
                                
                                Attach to Role
                              
                              
                              
                                
                                Edit Policy
                              
                              
                                
                                Delete Policy
                              
                            
                          
                        
                      
                    ))}
                  
                
              ) : (
                
                  
                  No custom policies yet
                  
                    Create policies to define fine-grained permissions
                  
                   setShowCreateModal(true)}>
                    
                    Create Policy
                  
                
              )}
            
          
        
      )}

      {/* Create Policy Modal */}
      
        
          
            Create Policy
            
              Define a permission policy for an entity type
            
          
          
          
            
              
                Policy Name
                 setNewPolicy({ ...newPolicy, name: e.target.value })}
                  placeholder="e.g., View Published Reports"
                />
              
              
                Effect
                 setNewPolicy({ ...newPolicy, effect: v as 'allow' | 'deny' })}
                >
                  
                    
                  
                  
                    Allow
                    Deny
                  
                
              
            
            
            
              Description
               setNewPolicy({ ...newPolicy, description: e.target.value })}
                placeholder="What does this policy control?"
              />
            
            
            
              
                Entity Type
                 setNewPolicy({ ...newPolicy, entityType: v })}
                >
                  
                    
                  
                  
                    {ENTITY_TYPES.map(type => (
                      
                        {type.replace(/_/g, ' ')}
                      
                    ))}
                  
                
              
              
                Scope
                 setNewPolicy({ ...newPolicy, scopeType: v })}
                >
                  
                    
                  
                  
                    {SCOPE_TYPES.map(scope => (
                      
                        {scope.label}
                      
                    ))}
                  
                
              
            
            
            
              Actions
              
                {ACTIONS.map(action => (
                  
                     toggleAction(action)}
                    />
                    
                      {action.replace(/_/g, ' ')}
                    
                  
                ))}
              
            
          
          
          
             {
              setShowCreateModal(false);
              resetNewPolicy();
            }}>
              Cancel
            
             createPolicyMutation.mutate(newPolicy)}
              disabled={!newPolicy.name || !newPolicy.entityType || newPolicy.actions.length === 0 || createPolicyMutation.isPending}
            >
              {createPolicyMutation.isPending ? 'Creating...' : 'Create Policy'}
            
          
        
      

      {/* Policy Details Modal */}
      
        
          
            {selectedPolicy?.name}
            
              {selectedPolicy?.description || 'No description provided'}
            
          
          
          {selectedPolicy && (
            
              
                
                  Entity Type
                  {selectedPolicy.entityType}
                
                
                  Scope
                  {selectedPolicy.scopeType}
                
                
                  Effect
                  {getEffectBadge(selectedPolicy.effect)}
                
                
                  Created
                  
                    {new Date(selectedPolicy.createdAt).toLocaleDateString()}
                  
                
              
              
              
                Actions
                
                  {selectedPolicy.actions.map(action => (
                    {action}
                  ))}
                
              
              
              {selectedPolicy.conditions && Object.keys(selectedPolicy.conditions).length > 0 && (
                
                  Conditions
                  
                    {JSON.stringify(selectedPolicy.conditions, null, 2)}
                  
                
              )}
            
          )}
          
          
             setShowDetailsModal(false)}>
              Close
            
          
        
      
    
  );
}