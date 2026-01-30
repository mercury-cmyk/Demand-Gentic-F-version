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
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeam, setNewTeam] = useState({ name: '', description: '' });
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isTeamLead, setIsTeamLead] = useState(false);

  // Fetch teams
  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ['/api/iam/teams'],
  });

  // Fetch team details with members
  const { data: teamDetails, isLoading: membersLoading } = useQuery<Team>({
    queryKey: ['/api/iam/teams', selectedTeam?.id],
    enabled: !!selectedTeam && showMembersModal,
  });

  // Fetch all users for adding to team
  const { data: users } = useQuery<User[]>({
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
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/iam">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">
            Organize users into teams for group-based access control
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Teams Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filteredTeams && filteredTeams.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTeams.map((team) => (
            <Card key={team.id} className="transition-all hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{team.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setSelectedTeam(team);
                        setShowMembersModal(true);
                      }}>
                        <Users className="h-4 w-4 mr-2" />
                        View Members
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedTeam(team);
                        setShowAddMemberModal(true);
                      }}>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add Member
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Team
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Team
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {team.description && (
                  <CardDescription>{team.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {team.members?.length ?? 0} members
                  </span>
                  <span>
                    Created {new Date(team.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No teams yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first team to organize users and manage access
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Team Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a new team to group users together
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder="e.g., QA Team, Sales AEs"
              />
            </div>
            <div>
              <Label htmlFor="team-description">Description</Label>
              <Textarea
                id="team-description"
                value={newTeam.description}
                onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                placeholder="What does this team do?"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createTeamMutation.mutate(newTeam)}
              disabled={!newTeam.name || createTeamMutation.isPending}
            >
              {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Team Members - {selectedTeam?.name}</DialogTitle>
            <DialogDescription>
              {teamDetails?.members?.length ?? 0} members in this team
            </DialogDescription>
          </DialogHeader>
          
          {membersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : teamDetails?.members && teamDetails.members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamDetails.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{getInitials(member)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.firstName && member.lastName 
                              ? `${member.firstName} ${member.lastName}`
                              : member.userName
                            }
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.userEmail}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.isLead ? (
                        <Badge className="gap-1">
                          <Crown className="h-3 w-3" />
                          Team Lead
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Member</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(member.joinedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No members in this team yet
            </p>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersModal(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setShowMembersModal(false);
              setShowAddMemberModal(true);
            }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Modal */}
      <Dialog open={showAddMemberModal} onOpenChange={setShowAddMemberModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a user to {selectedTeam?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Select User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}`
                        : user.username
                      }
                      <span className="text-muted-foreground ml-2">
                        ({user.email})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="team-lead" 
                checked={isTeamLead}
                onCheckedChange={(checked) => setIsTeamLead(checked as boolean)}
              />
              <Label htmlFor="team-lead" className="cursor-pointer">
                Make this user a Team Lead
              </Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => addMemberMutation.mutate({
                teamId: selectedTeam!.id,
                userId: selectedUserId,
                isLead: isTeamLead
              })}
              disabled={!selectedUserId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
