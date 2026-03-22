/**
 * IAM Access Grants Page
 * 
 * Manage direct permission grants to users and teams
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { 
  Key, Search, Plus, MoreHorizontal, Users, User, 
  ChevronLeft, Trash2, Calendar, AlertTriangle, CheckCircle
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface Grant {
  id: string;
  userId?: string;
  teamId?: string;
  entityType: string;
  entityId?: string;
  grantType: string;
  actions: string[];
  conditions?: Record;
  expiresAt?: string;
  reason?: string;
  isActive: boolean;
  grantedBy: string;
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface Team {
  id: string;
  name: string;
}

const ENTITY_TYPES = [
  'account', 'project', 'campaign', 'agent', 'call_session',
  'recording', 'transcript', 'report', 'lead', 'delivery',
  'domain', 'smtp', 'email_template', 'prompt', 'quality_review'
];

const ACTIONS = [
  'view', 'create', 'edit', 'delete', 'run', 'execute',
  'approve', 'publish', 'assign', 'export', 'manage_settings',
  'view_sensitive', 'manage_access'
];

const GRANT_TYPES = [
  { value: 'permission', label: 'Permanent Permission' },
  { value: 'temporary', label: 'Temporary Access' },
  { value: 'delegated', label: 'Delegated Access' },
  { value: 'inherited', label: 'Inherited' },
];

export default function IamGrants() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearch();
  const urlUserId = new URLSearchParams(searchParams).get('userId');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [granteeType, setGranteeType] = useState('user');
  
  const [newGrant, setNewGrant] = useState({
    userId: urlUserId || '',
    teamId: '',
    entityType: '',
    entityId: '',
    grantType: 'permission',
    actions: [] as string[],
    expiresAt: '',
    reason: '',
  });

  // Fetch grants
  const { data: grants, isLoading } = useQuery({
    queryKey: ['/api/iam/grants', urlUserId ? `userId=${urlUserId}` : ''],
  });

  // Fetch users for picker
  const { data: users } = useQuery({
    queryKey: ['/api/users'],
    enabled: showCreateModal,
  });

  // Fetch teams for picker
  const { data: teams } = useQuery({
    queryKey: ['/api/iam/teams'],
    enabled: showCreateModal,
  });

  // Create grant mutation
  const createGrantMutation = useMutation({
    mutationFn: async (data: typeof newGrant) => {
      const payload: any = {
        entityType: data.entityType,
        grantType: data.grantType,
        actions: data.actions,
        reason: data.reason || undefined,
      };
      
      if (granteeType === 'user') {
        payload.userId = data.userId;
      } else {
        payload.teamId = data.teamId;
      }
      
      if (data.entityId) payload.entityId = data.entityId;
      if (data.expiresAt) payload.expiresAt = new Date(data.expiresAt).toISOString();
      
      const res = await fetch('/api/iam/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create grant');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/grants'] });
      setShowCreateModal(false);
      resetNewGrant();
      toast({ title: 'Access grant created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create grant', variant: 'destructive' });
    },
  });

  const resetNewGrant = () => {
    setNewGrant({
      userId: '',
      teamId: '',
      entityType: '',
      entityId: '',
      grantType: 'permission',
      actions: [],
      expiresAt: '',
      reason: '',
    });
  };

  const toggleAction = (action: string) => {
    setNewGrant(prev => ({
      ...prev,
      actions: prev.actions.includes(action)
        ? prev.actions.filter(a => a !== action)
        : [...prev.actions, action]
    }));
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt)  {
    if (!expiresAt) return false;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const dayInMs = 24 * 60 * 60 * 1000;
    return expiry > now && (expiry.getTime() - now.getTime())  
    grant.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    grant.reason?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    
      {/* Header */}
      
        
          
            
          
        
        
          Access Grants
          
            Direct permission grants to users and teams
          
        
         setShowCreateModal(true)}>
          
          New Grant
        
      

      {/* Search */}
      
        
          
            
             setSearchQuery(e.target.value)}
              className="pl-10"
            />
          
        
      

      {/* Grants Table */}
      
        
          Active Grants
          
            {filteredGrants?.length ?? 0} grants
            {urlUserId && ' for selected user'}
          
        
        
          {isLoading ? (
            
              {[1, 2, 3].map(i => )}
            
          ) : filteredGrants && filteredGrants.length > 0 ? (
            
              
                
                  Grantee
                  Entity
                  Actions
                  Type
                  Expires
                  Actions
                
              
              
                {filteredGrants.map((grant) => (
                  
                    
                      
                        {grant.userId ? (
                          
                        ) : (
                          
                        )}
                        
                          {grant.userId ? 'User' : 'Team'}: {grant.userId || grant.teamId}
                        
                      
                    
                    
                      {grant.entityType}
                      {grant.entityId && (
                        
                          ({grant.entityId.slice(0, 8)}...)
                        
                      )}
                    
                    
                      
                        {grant.actions.slice(0, 2).map(action => (
                          
                            {action}
                          
                        ))}
                        {grant.actions.length > 2 && (
                          
                            +{grant.actions.length - 2}
                          
                        )}
                      
                    
                    
                      
                        {grant.grantType}
                      
                    
                    
                      {grant.expiresAt ? (
                        
                          {isExpired(grant.expiresAt) ? (
                            
                              
                              Expired
                            
                          ) : isExpiringSoon(grant.expiresAt) ? (
                            
                              
                              {new Date(grant.expiresAt).toLocaleDateString()}
                            
                          ) : (
                            
                              {new Date(grant.expiresAt).toLocaleDateString()}
                            
                          )}
                        
                      ) : (
                        
                          
                          Permanent
                        
                      )}
                    
                    
                      
                        
                          
                            
                          
                        
                        
                          
                            View Details
                          
                          
                          
                            
                            Revoke Grant
                          
                        
                      
                    
                  
                ))}
              
            
          ) : (
            
              
              No active grants
              
                Create grants to give users or teams direct access to resources
              
               setShowCreateModal(true)}>
                
                New Grant
              
            
          )}
        
      

      {/* Create Grant Modal */}
      
        
          
            Create Access Grant
            
              Grant direct access to a user or team
            
          
          
           setGranteeType(v as 'user' | 'team')}>
            
              
                
                User
              
              
                
                Team
              
            
            
            
              
                Select User
                 setNewGrant({ ...newGrant, userId: v })}>
                  
                    
                  
                  
                    {users?.map(user => (
                      
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}`
                          : user.username
                        } ({user.email})
                      
                    ))}
                  
                
              
            
            
            
              
                Select Team
                 setNewGrant({ ...newGrant, teamId: v })}>
                  
                    
                  
                  
                    {teams?.map(team => (
                      
                        {team.name}
                      
                    ))}
                  
                
              
            
          
          
          
            
              
                Entity Type
                 setNewGrant({ ...newGrant, entityType: v })}>
                  
                    
                  
                  
                    {ENTITY_TYPES.map(type => (
                      
                        {type.replace(/_/g, ' ')}
                      
                    ))}
                  
                
              
              
                Grant Type
                 setNewGrant({ ...newGrant, grantType: v })}>
                  
                    
                  
                  
                    {GRANT_TYPES.map(type => (
                      
                        {type.label}
                      
                    ))}
                  
                
              
            
            
            
              
                Specific Entity ID (Optional)
                 setNewGrant({ ...newGrant, entityId: e.target.value })}
                  placeholder="Leave empty for all"
                />
              
              
                Expires At (Optional)
                 setNewGrant({ ...newGrant, expiresAt: e.target.value })}
                />
              
            
            
            
              Actions
              
                {ACTIONS.map(action => (
                  
                     toggleAction(action)}
                    />
                    
                      {action.replace(/_/g, ' ')}
                    
                  
                ))}
              
            
            
            
              Reason
               setNewGrant({ ...newGrant, reason: e.target.value })}
                placeholder="Why is this access being granted?"
              />
            
          
          
          
             {
              setShowCreateModal(false);
              resetNewGrant();
            }}>
              Cancel
            
             createGrantMutation.mutate(newGrant)}
              disabled={
                (!newGrant.userId && !newGrant.teamId) || 
                !newGrant.entityType || 
                newGrant.actions.length === 0 || 
                createGrantMutation.isPending
              }
            >
              {createGrantMutation.isPending ? 'Creating...' : 'Create Grant'}
            
          
        
      
    
  );
}