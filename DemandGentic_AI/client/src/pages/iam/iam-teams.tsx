/**
 * IAM Teams Page
 * 
 * Manage teams and team membership
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Layers, Search, Plus, MoreHorizontal, Users, 
  ChevronLeft, Edit, Trash2, UserPlus, Crown
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Team {
  id: string;
  name: string;
  description?: string;
  organizationId?: string;
  isActive: boolean;
  createdAt: string;
  members?: TeamMember[];
}

interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  isLead: boolean;
  joinedAt: string;
  userName?: string;
  userEmail?: string;
  firstName?: string;
  lastName?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export default function IamTeams() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [newTeam, setNewTeam] = useState({ name: '', description: '' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isTeamLead, setIsTeamLead] = useState(false);

  // Fetch teams
  const { data: teams, isLoading } = useQuery({
    queryKey: ['/api/iam/teams'],
  });

  // Fetch team details with members
  const { data: teamDetails, isLoading: membersLoading } = useQuery({
    queryKey: ['/api/iam/teams', selectedTeam?.id],
    enabled: !!selectedTeam && showMembersModal,
  });

  // Fetch all users for adding to team
  const { data: users } = useQuery({
    queryKey: ['/api/users'],
    enabled: showAddMemberModal,
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch('/api/iam/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create team');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/teams'] });
      setShowCreateModal(false);
      setNewTeam({ name: '', description: '' });
      toast({ title: 'Team created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create team', variant: 'destructive' });
    },
  });

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (data: { teamId: string; userId: string; isLead?: boolean }) => {
      const res = await fetch(`/api/iam/teams/${data.teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: data.userId, isLead: data.isLead }),
      });
      if (!res.ok) throw new Error('Failed to add member');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/iam/teams', selectedTeam?.id] });
      setShowAddMemberModal(false);
      setSelectedUserId('');
      setIsTeamLead(false);
      toast({ title: 'Member added successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to add member', variant: 'destructive' });
    },
  });

  const filteredTeams = teams?.filter(team => 
    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    team.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (member: TeamMember) => {
    if (member.firstName && member.lastName) {
      return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
    }
    return member.userName?.slice(0, 2).toUpperCase() || '??';
  };

  return (
    
      {/* Header */}
      
        
          
            
          
        
        
          Teams
          
            Organize users into teams for group-based access control
          
        
         setShowCreateModal(true)}>
          
          Create Team
        
      

      {/* Search */}
      
        
          
            
             setSearchQuery(e.target.value)}
              className="pl-10"
            />
          
        
      

      {/* Teams Grid */}
      {isLoading ? (
        
          {[1, 2, 3].map(i => (
            
          ))}
        
      ) : filteredTeams && filteredTeams.length > 0 ? (
        
          {filteredTeams.map((team) => (
            
              
                
                  
                    
                      
                    
                    {team.name}
                  
                  
                    
                      
                        
                      
                    
                    
                       {
                        setSelectedTeam(team);
                        setShowMembersModal(true);
                      }}>
                        
                        View Members
                      
                       {
                        setSelectedTeam(team);
                        setShowAddMemberModal(true);
                      }}>
                        
                        Add Member
                      
                      
                      
                        
                        Edit Team
                      
                      
                        
                        Delete Team
                      
                    
                  
                
                {team.description && (
                  {team.description}
                )}
              
              
                
                  
                    
                    {team.members?.length ?? 0} members
                  
                  
                    Created {new Date(team.createdAt).toLocaleDateString()}
                  
                
              
            
          ))}
        
      ) : (
        
          
            
            No teams yet
            
              Create your first team to organize users and manage access
            
             setShowCreateModal(true)}>
              
              Create Team
            
          
        
      )}

      {/* Create Team Modal */}
      
        
          
            Create Team
            
              Create a new team to group users together
            
          
          
          
            
              Team Name
               setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder="e.g., QA Team, Sales AEs"
              />
            
            
              Description
               setNewTeam({ ...newTeam, description: e.target.value })}
                placeholder="What does this team do?"
              />
            
          
          
          
             setShowCreateModal(false)}>
              Cancel
            
             createTeamMutation.mutate(newTeam)}
              disabled={!newTeam.name || createTeamMutation.isPending}
            >
              {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
            
          
        
      

      {/* View Members Modal */}
      
        
          
            Team Members - {selectedTeam?.name}
            
              {teamDetails?.members?.length ?? 0} members in this team
            
          
          
          {membersLoading ? (
            
              {[1, 2, 3].map(i => )}
            
          ) : teamDetails?.members && teamDetails.members.length > 0 ? (
            
              
                
                  Member
                  Role
                  Joined
                
              
              
                {teamDetails.members.map((member) => (
                  
                    
                      
                        
                          {getInitials(member)}
                        
                        
                          
                            {member.firstName && member.lastName 
                              ? `${member.firstName} ${member.lastName}`
                              : member.userName
                            }
                          
                          
                            {member.userEmail}
                          
                        
                      
                    
                    
                      {member.isLead ? (
                        
                          
                          Team Lead
                        
                      ) : (
                        Member
                      )}
                    
                    
                      {new Date(member.joinedAt).toLocaleDateString()}
                    
                  
                ))}
              
            
          ) : (
            
              No members in this team yet
            
          )}
          
          
             setShowMembersModal(false)}>
              Close
            
             {
              setShowMembersModal(false);
              setShowAddMemberModal(true);
            }}>
              
              Add Member
            
          
        
      

      {/* Add Member Modal */}
      
        
          
            Add Team Member
            
              Add a user to {selectedTeam?.name}
            
          
          
          
            
              Select User
              
                
                  
                
                
                  {users?.map(user => (
                    
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}`
                        : user.username
                      }
                      
                        ({user.email})
                      
                    
                  ))}
                
              
            
            
            
               setIsTeamLead(checked as boolean)}
              />
              
                Make this user a Team Lead
              
            
          
          
          
             setShowAddMemberModal(false)}>
              Cancel
            
             addMemberMutation.mutate({
                teamId: selectedTeam!.id,
                userId: selectedUserId,
                isLead: isTeamLead
              })}
              disabled={!selectedUserId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
            
          
        
      
    
  );
}