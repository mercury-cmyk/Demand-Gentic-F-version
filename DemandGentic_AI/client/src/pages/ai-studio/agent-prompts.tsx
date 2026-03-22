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
import { apiRequest } from '@/lib/queryClient';

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
  contextRules: Record | null;
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

const promptTypeColors: Record = {
  system: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  capability: 'bg-green-500/10 text-green-500 border-green-500/20',
  restriction: 'bg-red-500/10 text-red-500 border-red-500/20',
  persona: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  context: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const roleLabels: Record = {
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
  const [roleFilter, setRoleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  // Fetch prompts
  const { data: prompts = [], isLoading, refetch } = useQuery({
    queryKey: ['agent-prompts', roleFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);

      const response = await apiRequest('GET', `/api/agent-prompts?${params.toString()}`);
      return response.json();
    },
  });

  // Fetch available tools
  const { data: tools = [] } = useQuery({
    queryKey: ['agent-tools'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/agent-prompts/tools/available');
      return response.json();
    },
  });

  // Create prompt mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial) => {
      const response = await apiRequest('POST', '/api/agent-prompts', data);
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
    mutationFn: async ({ id, data }: { id: string; data: Partial }) => {
      const response = await apiRequest('PUT', `/api/agent-prompts/${id}`, data);
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
      const response = await apiRequest('DELETE', `/api/agent-prompts/${id}`);
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
      const response = await apiRequest('POST', '/api/agent-prompts/seed-defaults');
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
  }, {} as Record);

  return (
    
      {/* Header */}
      
        
          
            
            Agent Prompts Management
          
          
            Configure and manage AI agent prompts by role
          
        
        
           (window.location.href = '/prompt-management')}
          >
            
            Edit Core Prompts
          
           seedDefaultsMutation.mutate()}
            disabled={seedDefaultsMutation.isPending}
          >
            {seedDefaultsMutation.isPending ? (
              
            ) : (
              
            )}
            Seed Defaults
          
           setIsCreateDialogOpen(true)}>
            
            Create Prompt
          
        
      

      {/* Filters */}
      
        
          
            
              
                
                 setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              
            
            
              
                
              
              
                All Roles
                Administrator
                Campaign Manager
                Quality Analyst
                Data Operations
                Agent
              
            
            
              
                
              
              
                All Types
                System
                Capability
                Restriction
                Persona
                Context
              
            
          
        
      

      {/* Stats */}
      
        
          
            {prompts.length}
            Total Prompts
          
        
        
          
            {prompts.filter((p) => p.isActive).length}
            Active
          
        
        
          
            {Object.keys(promptsByRole).length}
            Roles Configured
          
        
        
          
            {prompts.filter((p) => p.isClientPortal).length}
            Client Portal
          
        
      

      {/* Prompts List */}
      {isLoading ? (
        
          
            
            Loading prompts...
          
        
      ) : filteredPrompts.length === 0 ? (
        
          
            
            No prompts found
            
              {searchQuery ? 'Try a different search term' : 'Create your first prompt or seed defaults'}
            
             seedDefaultsMutation.mutate()} variant="outline">
              
              Seed Default Prompts
            
          
        
      ) : (
        
          {Object.entries(promptsByRole).map(([role, rolePrompts]) => (
             deleteMutation.mutate(id)}
              onToggleActive={(prompt) =>
                updateMutation.mutate({
                  id: prompt.id,
                  data: { isActive: !prompt.isActive },
                })
              }
            />
          ))}
        
      )}

      {/* Create/Edit Dialog */}
       {
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
    
      
        
          
            
              
                
                  
                
                
                  
                    {roleLabels[role] || role}
                  
                  
                    {prompts.length} prompt{prompts.length !== 1 ? 's' : ''} configured
                  
                
              
              
                {prompts.filter((p) => p.isActive).length} active
                {isExpanded ? (
                  
                ) : (
                  
                )}
              
            
          
        
        
          
            
              {prompts.map((prompt) => (
                 onEdit(prompt)}
                  onDelete={() => onDelete(prompt.id)}
                  onToggleActive={() => onToggleActive(prompt)}
                />
              ))}
            
          
        
      
    
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
    
      
        
          
            {prompt.name}
            
              {prompt.promptType}
            
            {!prompt.isActive && (
              
                Inactive
              
            )}
          
          {prompt.description && (
            {prompt.description}
          )}
          
            {prompt.capabilities?.slice(0, 5).map((cap) => (
              
                {cap}
              
            ))}
            {prompt.capabilities && prompt.capabilities.length > 5 && (
              
                +{prompt.capabilities.length - 5} more
              
            )}
          
          
            
              
                {showContent ? 'Hide content' : 'Show content'}
                {showContent ? (
                  
                ) : (
                  
                )}
              
            
            
              
                {prompt.promptContent}
              
            
          
        
        
          
          
            
          
          
            
          
        
      
      
        Version {prompt.version}
        Priority: {prompt.priority}
        Updated: {new Date(prompt.updatedAt).toLocaleDateString()}
      
    
  );
}

// Create/Edit Dialog
interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: AgentPrompt | null;
  tools: Tool[];
  onSave: (data: Partial) => void;
  isSaving: boolean;
}

function PromptDialog({ open, onOpenChange, prompt, tools, onSave, isSaving }: PromptDialogProps) {
  const [formData, setFormData] = useState>({
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
  }, {} as Record);

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
    
      
        
          {prompt ? 'Edit Prompt' : 'Create New Prompt'}
          
            Configure the agent prompt settings and capabilities
          
        

        
          
            
              Name
               setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter prompt name"
              />
            
            
              Type
               setFormData({ ...formData, promptType: value as any })}
              >
                
                  
                
                
                  System
                  Capability
                  Restriction
                  Persona
                  Context
                
              
            
          

          
            Description
             setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this prompt"
            />
          

          
            
              User Role
              
                  setFormData({ ...formData, userRole: value === 'none' ? null : value })
                }
              >
                
                  
                
                
                  Universal (All Roles)
                  Administrator
                  Campaign Manager
                  Quality Analyst
                  Data Operations
                  Agent
                  Content Creator
                
              
            
            
              Priority
               setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              />
            
          

          
            
               setFormData({ ...formData, isClientPortal: checked })}
              />
              Client Portal Only
            
            
               setFormData({ ...formData, isActive: checked })}
              />
              Active
            
          

          
            Prompt Content
             setFormData({ ...formData, promptContent: e.target.value })}
              placeholder="Enter the prompt content..."
              className="min-h-[150px] font-mono text-sm"
            />
          

          
            
              Capabilities
              Restrictions
            
            
              
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  
                    {category}
                    
                      {categoryTools.map((tool) => (
                         toggleCapability(tool.id)}
                        >
                          {formData.capabilities?.includes(tool.id) && (
                            
                          )}
                          {tool.name}
                        
                      ))}
                    
                  
                ))}
              
            
            
              
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  
                    {category}
                    
                      {categoryTools.map((tool) => (
                         toggleRestriction(tool.id)}
                        >
                          {formData.restrictions?.includes(tool.id) && (
                            
                          )}
                          {tool.name}
                        
                      ))}
                    
                  
                ))}
              
            
          
        

        
           onOpenChange(false)}>
            Cancel
          
           onSave(formData)} disabled={isSaving || !formData.name || !formData.promptContent}>
            {isSaving && }
            {prompt ? 'Save Changes' : 'Create Prompt'}
          
        
      
    
  );
}