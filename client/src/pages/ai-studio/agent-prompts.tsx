/**
 * Agent Prompts Management Page
 *
 * Admin interface for managing role-based agent prompts and capabilities
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  History,
  Copy,
  Check,
  X,
  Shield,
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Types
interface AgentPrompt {
  id: string;
  name: string;
  description: string | null;
  userRole: string | null;
  iamRoleId: string | null;
  isClientPortal: boolean;
  promptType: 'system' | 'capability' | 'restriction' | 'persona' | 'context';
  promptContent: string;
  capabilities: string[] | null;
  restrictions: string[] | null;
  contextRules: Record<string, any> | null;
  isActive: boolean;
  priority: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Tool {
  id: string;
  name: string;
  category: string;
  description: string;
}

const promptTypeColors: Record<string, string> = {
  system: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  capability: 'bg-green-500/10 text-green-500 border-green-500/20',
  restriction: 'bg-red-500/10 text-red-500 border-red-500/20',
  persona: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  context: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  agent: 'Agent',
  campaign_manager: 'Campaign Manager',
  quality_analyst: 'Quality Analyst',
  data_ops: 'Data Operations',
  content_creator: 'Content Creator',
  client: 'Client Portal',
};

export default function AgentPromptsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<AgentPrompt | null>(null);

  // Fetch prompts
  const { data: prompts = [], isLoading, refetch } = useQuery<AgentPrompt[]>({
    queryKey: ['agent-prompts', roleFilter, typeFilter],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const response = await fetch(`/api/agent-prompts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch prompts');
      return response.json();
    },
  });

  // Fetch available tools
  const { data: tools = [] } = useQuery<Tool[]>({
    queryKey: ['agent-tools'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/agent-prompts/tools/available', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch tools');
      return response.json();
    },
  });

  // Create prompt mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<AgentPrompt>) => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/agent-prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create prompt');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-prompts'] });
      setIsCreateDialogOpen(false);
      toast({ title: 'Success', description: 'Prompt created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Update prompt mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AgentPrompt> }) => {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/agent-prompts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update prompt');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-prompts'] });
      setEditingPrompt(null);
      toast({ title: 'Success', description: 'Prompt updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete prompt mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/agent-prompts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete prompt');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-prompts'] });
      toast({ title: 'Success', description: 'Prompt deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Seed defaults mutation
  const seedDefaultsMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/agent-prompts/seed-defaults', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to seed defaults');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-prompts'] });
      toast({ title: 'Success', description: data.message });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Filter prompts
  const filteredPrompts = prompts.filter((prompt) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        prompt.name.toLowerCase().includes(query) ||
        prompt.description?.toLowerCase().includes(query) ||
        prompt.promptContent.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Group prompts by role
  const promptsByRole = filteredPrompts.reduce((acc, prompt) => {
    const role = prompt.isClientPortal ? 'client' : prompt.userRole || 'universal';
    if (!acc[role]) acc[role] = [];
    acc[role].push(prompt);
    return acc;
  }, {} as Record<string, AgentPrompt[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" />
            Agent Prompts Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure and manage AI agent prompts by role
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = '/prompt-management')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Edit Core Prompts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedDefaultsMutation.mutate()}
            disabled={seedDefaultsMutation.isPending}
          >
            {seedDefaultsMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Seed Defaults
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Prompt
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prompts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                <SelectItem value="quality_analyst">Quality Analyst</SelectItem>
                <SelectItem value="data_ops">Data Operations</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="capability">Capability</SelectItem>
                <SelectItem value="restriction">Restriction</SelectItem>
                <SelectItem value="persona">Persona</SelectItem>
                <SelectItem value="context">Context</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{prompts.length}</div>
            <p className="text-xs text-muted-foreground">Total Prompts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{prompts.filter((p) => p.isActive).length}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{Object.keys(promptsByRole).length}</div>
            <p className="text-xs text-muted-foreground">Roles Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{prompts.filter((p) => p.isClientPortal).length}</div>
            <p className="text-xs text-muted-foreground">Client Portal</p>
          </CardContent>
        </Card>
      </div>

      {/* Prompts List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading prompts...</p>
          </CardContent>
        </Card>
      ) : filteredPrompts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-semibold mb-2">No prompts found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery ? 'Try a different search term' : 'Create your first prompt or seed defaults'}
            </p>
            <Button onClick={() => seedDefaultsMutation.mutate()} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              Seed Default Prompts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(promptsByRole).map(([role, rolePrompts]) => (
            <RoleSection
              key={role}
              role={role}
              prompts={rolePrompts}
              onEdit={setEditingPrompt}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggleActive={(prompt) =>
                updateMutation.mutate({
                  id: prompt.id,
                  data: { isActive: !prompt.isActive },
                })
              }
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <PromptDialog
        open={isCreateDialogOpen || !!editingPrompt}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingPrompt(null);
          }
        }}
        prompt={editingPrompt}
        tools={tools}
        onSave={(data) => {
          if (editingPrompt) {
            updateMutation.mutate({ id: editingPrompt.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// Role Section Component
interface RoleSectionProps {
  role: string;
  prompts: AgentPrompt[];
  onEdit: (prompt: AgentPrompt) => void;
  onDelete: (id: string) => void;
  onToggleActive: (prompt: AgentPrompt) => void;
}

function RoleSection({ role, prompts, onEdit, onDelete, onToggleActive }: RoleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const roleIcon = role === 'client' ? Users : Shield;
  const RoleIcon = roleIcon;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <RoleIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {roleLabels[role] || role}
                  </CardTitle>
                  <CardDescription>
                    {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} configured
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{prompts.filter((p) => p.isActive).length} active</Badge>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {prompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onEdit={() => onEdit(prompt)}
                  onDelete={() => onDelete(prompt.id)}
                  onToggleActive={() => onToggleActive(prompt)}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Prompt Card Component
interface PromptCardProps {
  prompt: AgentPrompt;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function PromptCard({ prompt, onEdit, onDelete, onToggleActive }: PromptCardProps) {
  const [showContent, setShowContent] = useState(false);

  return (
    <div
      className={cn(
        'border rounded-lg p-4 transition-all',
        prompt.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-medium truncate">{prompt.name}</h4>
            <Badge variant="outline" className={cn('text-xs', promptTypeColors[prompt.promptType])}>
              {prompt.promptType}
            </Badge>
            {!prompt.isActive && (
              <Badge variant="secondary" className="text-xs">
                Inactive
              </Badge>
            )}
          </div>
          {prompt.description && (
            <p className="text-sm text-muted-foreground mb-2">{prompt.description}</p>
          )}
          <div className="flex flex-wrap gap-2 mb-2">
            {prompt.capabilities?.slice(0, 5).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {cap}
              </Badge>
            ))}
            {prompt.capabilities && prompt.capabilities.length > 5 && (
              <Badge variant="secondary" className="text-xs">
                +{prompt.capabilities.length - 5} more
              </Badge>
            )}
          </div>
          <Collapsible open={showContent} onOpenChange={setShowContent}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                {showContent ? 'Hide content' : 'Show content'}
                {showContent ? (
                  <ChevronDown className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 ml-1" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-muted/50 rounded-md text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                {prompt.promptContent}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={prompt.isActive} onCheckedChange={onToggleActive} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
        <span>Version {prompt.version}</span>
        <span>Priority: {prompt.priority}</span>
        <span>Updated: {new Date(prompt.updatedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// Create/Edit Dialog
interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AgentPrompt | null;
  tools: Tool[];
  onSave: (data: Partial<AgentPrompt>) => void;
  isSaving: boolean;
}

function PromptDialog({ open, onOpenChange, prompt, tools, onSave, isSaving }: PromptDialogProps) {
  const [formData, setFormData] = useState<Partial<AgentPrompt>>({
    name: '',
    description: '',
    userRole: null,
    isClientPortal: false,
    promptType: 'system',
    promptContent: '',
    capabilities: [],
    restrictions: [],
    isActive: true,
    priority: 0,
  });

  // Reset form when prompt changes
  useState(() => {
    if (prompt) {
      setFormData(prompt);
    } else {
      setFormData({
        name: '',
        description: '',
        userRole: null,
        isClientPortal: false,
        promptType: 'system',
        promptContent: '',
        capabilities: [],
        restrictions: [],
        isActive: true,
        priority: 0,
      });
    }
  });

  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, Tool[]>);

  const toggleCapability = (toolId: string) => {
    const current = formData.capabilities || [];
    const updated = current.includes(toolId)
      ? current.filter((c) => c !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, capabilities: updated });
  };

  const toggleRestriction = (toolId: string) => {
    const current = formData.restrictions || [];
    const updated = current.includes(toolId)
      ? current.filter((r) => r !== toolId)
      : [...current, toolId];
    setFormData({ ...formData, restrictions: updated });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Edit Prompt' : 'Create New Prompt'}</DialogTitle>
          <DialogDescription>
            Configure the agent prompt settings and capabilities
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter prompt name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.promptType}
                onValueChange={(value) => setFormData({ ...formData, promptType: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="capability">Capability</SelectItem>
                  <SelectItem value="restriction">Restriction</SelectItem>
                  <SelectItem value="persona">Persona</SelectItem>
                  <SelectItem value="context">Context</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this prompt"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">User Role</Label>
              <Select
                value={formData.userRole || 'none'}
                onValueChange={(value) =>
                  setFormData({ ...formData, userRole: value === 'none' ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Universal (All Roles)</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="campaign_manager">Campaign Manager</SelectItem>
                  <SelectItem value="quality_analyst">Quality Analyst</SelectItem>
                  <SelectItem value="data_ops">Data Operations</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="content_creator">Content Creator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="clientPortal"
                checked={formData.isClientPortal}
                onCheckedChange={(checked) => setFormData({ ...formData, isClientPortal: checked })}
              />
              <Label htmlFor="clientPortal">Client Portal Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="active"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Prompt Content</Label>
            <Textarea
              id="content"
              value={formData.promptContent}
              onChange={(e) => setFormData({ ...formData, promptContent: e.target.value })}
              placeholder="Enter the prompt content..."
              className="min-h-[150px] font-mono text-sm"
            />
          </div>

          <Tabs defaultValue="capabilities" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
              <TabsTrigger value="restrictions">Restrictions</TabsTrigger>
            </TabsList>
            <TabsContent value="capabilities" className="mt-4">
              <ScrollArea className="h-[200px] border rounded-md p-4">
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-sm font-medium mb-2">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {categoryTools.map((tool) => (
                        <Badge
                          key={tool.id}
                          variant={formData.capabilities?.includes(tool.id) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleCapability(tool.id)}
                        >
                          {formData.capabilities?.includes(tool.id) && (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="restrictions" className="mt-4">
              <ScrollArea className="h-[200px] border rounded-md p-4">
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  <div key={category} className="mb-4">
                    <h4 className="text-sm font-medium mb-2">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {categoryTools.map((tool) => (
                        <Badge
                          key={tool.id}
                          variant={formData.restrictions?.includes(tool.id) ? 'destructive' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleRestriction(tool.id)}
                        >
                          {formData.restrictions?.includes(tool.id) && (
                            <X className="h-3 w-3 mr-1" />
                          )}
                          {tool.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(formData)} disabled={isSaving || !formData.name || !formData.promptContent}>
            {isSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            {prompt ? 'Save Changes' : 'Create Prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
