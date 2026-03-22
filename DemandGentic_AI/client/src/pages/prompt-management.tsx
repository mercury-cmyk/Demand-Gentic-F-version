/**
 * Prompt Management Page
 *
 * CENTRALIZED UI for managing ALL AI agent prompts.
 *
 * Features:
 * - Browse by category (Voice, Email, Intelligence, Compliance, System)
 * - Filter by department, function, purpose, AI model, entity, status
 * - Search and filter prompts
 * - Edit with rich markdown preview
 * - Version history with diff view
 * - Sync from codebase defaults
 * - Preview compiled prompts with context
 * - Governance: draft/live management, ownership, change control
 * - Dependency mapping: see how prompts connect to endpoints/services
 * - System audit: full transparency into all AI prompts
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Save,
  RotateCcw,
  Code,
  Search,
  History,
  Edit2,
  RefreshCw,
  Eye,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Phone,
  Mail,
  Brain,
  Shield,
  Settings,
  Clock,
  User,
  FileText,
  Copy,
  Undo2,
  X,
  Network,
  ShieldCheck,
  BarChart3,
  ClipboardList,
  Building2,
  Cpu,
  GitBranch,
  Users,
  AlertTriangle,
  Archive,
  ArrowRight,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ==================== TYPES ====================

interface PromptListItem {
  id: string;
  key?: string;
  source?: string;
  promptKey?: string;
  name: string;
  description: string | null;
  promptType?: string;
  promptScope?: string;
  agentType: string | null;
  category: string | null;
  isActive: boolean;
  version: number;
  updatedAt: string;
  updatedByName?: string | null;
}

interface PromptDetail extends PromptListItem {
  content: string;
  defaultContent?: string;
  isLocked?: boolean;
  priority: number;
  tags: string[];
  sourceFile?: string | null;
  sourceLine?: number | null;
  sourceExport?: string | null;
  createdAt: string;
  createdByName?: string | null;
}

interface PromptVersionItem {
  id: string;
  version: number;
  changeDescription: string | null;
  changedAt: string;
  changedByName?: string | null;
  addedLines?: number | null;
  removedLines?: number | null;
  modifiedLines?: number | null;
}

interface PromptVersionDetail extends PromptVersionItem {
  content: string;
  previousContent: string | null;
}

interface PromptCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

interface PromptStats {
  total: number;
  byCategory: Record;
  byType: Record;
  recentlyUpdated: number;
}

interface SystemAudit {
  totalPrompts: number;
  byDepartment: Record;
  byFunction: Record;
  byModel: Record;
  byCategory: Record;
  byStatus: Record;
  byPurpose: Record;
  unownedPrompts: number;
  draftPrompts: number;
  totalDependencies: number;
}

interface GovernanceData {
  pendingDrafts: Array;
  recentChanges: Array;
  ownershipGaps: Array;
  deprecatedPrompts: Array;
}

interface PromptDependency {
  id: string;
  entityType: string;
  entityName: string;
  endpointPath: string | null;
  httpMethod: string | null;
  serviceFunction: string;
  direction: string;
}

// ==================== CATEGORY ICONS ====================

const categoryIcons: Record = {
  voice: ,
  email: ,
  intelligence: ,
  compliance: ,
  system: ,
};

const categoryColors: Record = {
  voice: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  email: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
  intelligence: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  compliance: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  system: 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300',
};

// ==================== MAIN COMPONENT ====================

export default function PromptManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [mainTab, setMainTab] = useState('registry');
  const [selectedCategory, setSelectedCategory] = useState('voice');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [viewMode, setViewMode] = useState('view');
  const [editContent, setEditContent] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [selectedVersion, setSelectedVersion] = useState(null);
  // Enhanced filters
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterFunction, setFilterFunction] = useState('');
  const [filterPurpose, setFilterPurpose] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  const isFoundationalSyntheticId = (value?: string | null) =>
    Boolean(value && value.startsWith('foundational_'));

  const getPromptLookupUrl = (value: string) => {
    if (isFoundationalSyntheticId(value)) {
      const agentId = value.replace('foundational_', '');
      return `/api/prompts/key/foundational.${agentId}`;
    }
    return `/api/prompts/${value}`;
  };

  const getPromptUpdateUrl = (value: string) => {
    const sourceId = selectedPromptId || value;
    if (sourceId && isFoundationalSyntheticId(sourceId)) {
      const agentId = sourceId.replace('foundational_', '');
      return `/api/prompts/key/foundational.${agentId}`;
    }
    if (isFoundationalSyntheticId(value)) {
      const agentId = value.replace('foundational_', '');
      return `/api/prompts/key/foundational.${agentId}`;
    }
    return `/api/prompts/${value}`;
  };

  const resolvePromptIdForMutation = async (): Promise => {
    const currentId = effectivePromptId;
    if (!currentId) {
      throw new Error('No prompt selected');
    }

    if (!isFoundationalSyntheticId(currentId)) {
      return currentId;
    }

    const agentId = currentId.replace('foundational_', '');
    const foundationalKey = `foundational.${agentId}`;

    // First attempt: resolve directly by key
    try {
      const directLookupRes = await apiRequest('GET', `/api/prompts/key/${foundationalKey}`);
      const directLookupData = await directLookupRes.json();
      const directResolvedId = directLookupData?.prompt?.id || directLookupData?.id;
      if (directResolvedId && !isFoundationalSyntheticId(directResolvedId)) {
        return directResolvedId;
      }
    } catch {
      // Continue to sync-based resolution
    }

    // Second attempt: sync then resolve
    try {
      await apiRequest('POST', '/api/prompts/sync', {});
      const lookupRes = await apiRequest('GET', `/api/prompts/key/${foundationalKey}`);
      const lookupData = await lookupRes.json();
      const resolvedId = lookupData?.prompt?.id || lookupData?.id;
      if (resolvedId && !isFoundationalSyntheticId(resolvedId)) {
        return resolvedId;
      }
    } catch {
      // Final fallback below
    }

    // Final fallback: use current ID and let server resolve/materialize it.
    return currentId;
  };

  const parseApiResponse = async (res: Response): Promise => {
    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Non-JSON API response: ${text.slice(0, 120)}`);
    }
  };

  const normalizePrompt = (prompt: any): PromptDetail => ({
    ...prompt,
    promptKey: prompt.promptKey ?? prompt.key,
    promptType: prompt.promptType ?? prompt.metadata?.promptType ?? prompt.source ?? 'system',
    promptScope: prompt.promptScope ?? prompt.metadata?.promptScope ?? prompt.source ?? 'global',
    content: prompt.content ?? '',
    defaultContent: prompt.defaultContent ?? prompt.content ?? '',
    tags: prompt.tags ?? [],
    sourceFile: prompt.sourceFile ?? prompt.metadata?.sourceFile ?? null,
    sourceLine: prompt.sourceLine ?? prompt.metadata?.sourceLine ?? null,
    sourceExport: prompt.sourceExport ?? prompt.metadata?.sourceExport ?? null,
    isLocked:
      (prompt.key && String(prompt.key).startsWith('foundational.')) ||
      (prompt.source && String(prompt.source) === 'foundational')
        ? false
        : (prompt.isLocked ?? false),
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
    updatedByName: prompt.updatedByName ?? null,
    createdByName: prompt.createdByName ?? null,
    description: prompt.description ?? null,
    agentType: prompt.agentType ?? null,
    category: prompt.category ?? 'system',
    priority: prompt.priority ?? 0,
  });

  // Only allow admins
  if (!user || user.role !== 'admin') {
    return ;
  }

  // ==================== QUERIES ====================

  const { data: categories } = useQuery({
    queryKey: ['/api/prompts/categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/categories');
      const data = await res.json();
      return data.categories || data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['/api/prompts/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/stats');
      return res.json();
    },
  });

  const { data: prompts, isLoading: isLoadingPrompts } = useQuery({
    queryKey: ['/api/prompts', selectedCategory, searchQuery, filterDepartment, filterFunction, filterPurpose, filterModel, filterStatus, filterEntity],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (searchQuery) params.set('search', searchQuery);
      if (filterDepartment) params.set('department', filterDepartment);
      if (filterFunction) params.set('promptFunction', filterFunction);
      if (filterPurpose) params.set('purpose', filterPurpose);
      if (filterModel) params.set('aiModel', filterModel);
      if (filterStatus) params.set('status', filterStatus);
      if (filterEntity) params.set('entity', filterEntity);
      params.set('limit', '200');
      const res = await apiRequest('GET', `/api/prompts?${params}`);
      const data = await res.json();
      return (data.prompts || data).map((p: any) => normalizePrompt(p));
    },
  });

  // Governance & Audit queries
  const { data: auditData } = useQuery({
    queryKey: ['/api/prompts/audit'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/audit');
      const data = await res.json();
      return data.audit;
    },
    enabled: mainTab === 'audit' || mainTab === 'registry',
  });

  const { data: governanceData } = useQuery({
    queryKey: ['/api/prompts/governance'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/governance');
      return res.json();
    },
    enabled: mainTab === 'governance',
  });

  const { data: departmentCounts } = useQuery>({
    queryKey: ['/api/prompts/departments'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/departments');
      const data = await res.json();
      return data.departments;
    },
  });

  const { data: functionCounts } = useQuery>({
    queryKey: ['/api/prompts/functions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/functions');
      const data = await res.json();
      return data.functions;
    },
  });

  const { data: modelCounts } = useQuery>({
    queryKey: ['/api/prompts/models'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/models');
      const data = await res.json();
      return data.models;
    },
  });

  const { data: promptDependencies } = useQuery({
    queryKey: ['/api/prompts/dependencies', selectedPromptId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/prompts/dependencies/${selectedPromptId}`);
      const data = await res.json();
      return data.dependencies;
    },
    enabled: !!selectedPromptId,
  });

  const { data: selectedPrompt, isLoading: isLoadingPrompt } = useQuery({
    queryKey: ['/api/prompts', 'detail', selectedPromptId],
    queryFn: async () => {
      const res = await apiRequest('GET', getPromptLookupUrl(selectedPromptId!));
      const data = await parseApiResponse(res);
      return normalizePrompt(data.prompt || data);
    },
    enabled: !!selectedPromptId,
  });

  const effectivePromptId = selectedPrompt?.id || selectedPromptId;

  const { data: versionHistory, isLoading: isLoadingVersions } = useQuery({
    queryKey: ['/api/prompts', effectivePromptId, 'versions'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/prompts/${effectivePromptId}/versions`);
      const data = await parseApiResponse(res);
      return (data.versions || data).map((v: any) => ({
        ...v,
        changeDescription: v.changeDescription ?? null,
        addedLines: v.addedLines ?? 0,
        removedLines: v.removedLines ?? 0,
        modifiedLines: v.modifiedLines ?? 0,
      }));
    },
    enabled: !!effectivePromptId && viewMode === 'history',
  });

  // ==================== MUTATIONS ====================

  const updateMutation = useMutation({
    mutationFn: async (data: { content: string; changeDescription: string }) => {
      const promptId = await resolvePromptIdForMutation();
      const updateUrl = getPromptUpdateUrl(promptId);
      const res = await apiRequest('PUT', updateUrl, data);
      const result = await parseApiResponse(res);
      return { result, promptId };
    },
    onSuccess: ({ result, promptId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', 'detail', selectedPromptId] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', promptId, 'versions'] });
      setViewMode('view');
      setChangeDescription('');
      toast({
        title: 'Prompt Updated',
        description: `Version ${result.prompt?.version ?? result.version ?? 'updated'} saved successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const promptId = await resolvePromptIdForMutation();
      const res = await apiRequest('POST', `/api/prompts/${promptId}/revert`, {});
      const result = await parseApiResponse(res);
      return { result, promptId };
    },
    onSuccess: ({ promptId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', 'detail', selectedPromptId] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', promptId, 'versions'] });
      toast({
        title: 'Reset Complete',
        description: 'Prompt has been reset to default content.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Reset Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (version: number) => {
      const promptId = await resolvePromptIdForMutation();
      const res = await apiRequest('POST', `/api/prompts/${promptId}/restore/${version}`, {});
      const result = await parseApiResponse(res);
      return { result, promptId, restoredVersion: version };
    },
    onSuccess: ({ promptId, restoredVersion }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', 'detail', selectedPromptId] });
      queryClient.invalidateQueries({ queryKey: ['/api/prompts', promptId, 'versions'] });
      setSelectedVersion(null);
      toast({
        title: 'Reverted',
        description: `Prompt reverted to version ${restoredVersion}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Revert Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/prompts/sync', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      toast({
        title: 'Sync Complete',
        description: `${data.result?.created ?? 0} created, ${data.result?.updated ?? 0} updated, ${data.result?.unchanged ?? 0} unchanged.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ==================== HANDLERS ====================

  const handleSelectPrompt = (prompt: PromptListItem) => {
    setSelectedPromptId(prompt.id);
    setViewMode('view');
    setSelectedVersion(null);
  };

  const handleStartEdit = () => {
    if (selectedPrompt) {
      setEditContent(selectedPrompt.content);
      setViewMode('edit');
    }
  };

  const handleCancelEdit = () => {
    setViewMode('view');
    setEditContent('');
    setChangeDescription('');
  };

  const handleSaveEdit = () => {
    updateMutation.mutate({
      content: editContent,
      changeDescription: changeDescription.trim() || 'Manual update via Prompt Management',
    });
  };

  const handleViewVersion = async (version: number) => {
    const versionDetail = versionHistory?.find((v) => v.version === version) ?? null;
    if (!versionDetail) {
      toast({
        title: 'Error',
        description: 'Failed to load version details.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedVersion(versionDetail as PromptVersionDetail);
  };

  const handleCopyContent = () => {
    if (selectedPrompt) {
      navigator.clipboard.writeText(selectedPrompt.content);
      toast({
        title: 'Copied',
        description: 'Prompt content copied to clipboard.',
      });
    }
  };

  // ==================== RENDER HELPERS ====================

  const renderPromptList = () => {
    if (isLoadingPrompts) {
      return (
        
          
        
      );
    }

    if (!prompts || prompts.length === 0) {
      return (
        
          
          No prompts found
          Click "Sync from Codebase" to import prompts
        
      );
    }

    return (
      
        {prompts.map((prompt) => (
           handleSelectPrompt(prompt)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedPromptId === prompt.id
                ? 'bg-primary/10 border-primary'
                : 'hover:bg-muted/50 border-transparent'
            }`}
          >
            
              
                {prompt.name}
                {prompt.promptKey || prompt.key}
              
              
                {prompt.isActive ? (
                  
                    Active
                  
                ) : (
                  
                    Inactive
                  
                )}
              
            
            
              v{prompt.version}
              |
              
              {new Date(prompt.updatedAt).toLocaleDateString()}
            
          
        ))}
      
    );
  };

  const renderPromptDetail = () => {
    if (!selectedPromptId) {
      return (
        
          
            
              
              Select a prompt to view
              Choose a prompt from the list to see its details
            
          
        
      );
    }

    if (isLoadingPrompt) {
      return (
        
          
            
              
            
          
        
      );
    }

    if (!selectedPrompt) {
      return (
        
          
            
              
              Prompt not found
            
          
        
      );
    }

    const isCorePrompt =
      selectedPrompt.source === 'foundational' ||
      !!selectedPrompt.promptKey?.startsWith('foundational.') ||
      !!selectedPrompt.tags?.includes('core-agent') ||
      !!selectedPrompt.tags?.includes('foundational');

    return (
      
        
          
            
              {selectedPrompt.name}
              
                {selectedPrompt.promptKey}
                |
                v{selectedPrompt.version}
                {selectedPrompt.updatedByName && (
                  <>
                    |
                    
                    {selectedPrompt.updatedByName}
                  
                )}
              
            
            
              {viewMode === 'view' && (
                <>
                  
                    
                      
                        
                          
                        
                      
                      Copy content
                    
                  
                   setViewMode('history')}>
                    
                    History
                  
                  
                    
                    Edit
                  
                
              )}
              {viewMode === 'edit' && (
                <>
                  
                    
                    Cancel
                  
                  
                    {updateMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Save
                  
                
              )}
              {viewMode === 'history' && (
                 setViewMode('view')}>
                  
                  View Current
                
              )}
            
          
          {selectedPrompt.description && (
            {selectedPrompt.description}
          )}
        

        
          {viewMode === 'view' && (
            <>
              {/* Metadata badges */}
              
                
                  {categoryIcons[selectedPrompt.category || 'system']}
                  {selectedPrompt.category || 'system'}
                
                {selectedPrompt.promptType}
                {selectedPrompt.promptScope}
                {selectedPrompt.tags?.map((tag, idx) => (
                  
                    {tag}
                  
                ))}
                {isCorePrompt && (
                  
                    Core Prompt (Editable)
                  
                )}
              

              {/* Dependencies section */}
              {promptDependencies && promptDependencies.length > 0 && (
                
                  
                    
                    Dependencies ({promptDependencies.length})
                  
                  
                    {promptDependencies.map((dep) => (
                      
                        
                          {dep.direction}
                        
                        {dep.entityName}
                        {dep.endpointPath && (
                          <>
                            
                            {dep.httpMethod} {dep.endpointPath}
                          
                        )}
                        ({dep.serviceFunction})
                      
                    ))}
                  
                
              )}

              {/* Content viewer */}
              
                
                  
                    {selectedPrompt.content}
                  
                
              

              {/* Stats footer */}
              
                {selectedPrompt.content.split('\n').length} lines
                {selectedPrompt.content.split(/\s+/).length} words
                {selectedPrompt.content.length.toLocaleString()} chars
                ~{Math.ceil(selectedPrompt.content.length / 4).toLocaleString()} tokens
              

              {/* Source info */}
              {selectedPrompt.sourceFile && (
                
                  Source: {selectedPrompt.sourceFile}
                  {selectedPrompt.sourceLine && `:${selectedPrompt.sourceLine}`}
                
              )}

              {/* Reset button */}
              {selectedPrompt.content !== selectedPrompt.defaultContent && (
                
                  
                    
                      
                        
                        Reset to Default
                      
                    
                    
                      
                        Reset to Default?
                        
                          This will replace the current content with the original default from the codebase.
                          A new version will be created for tracking purposes.
                        
                      
                      
                        Cancel
                         resetMutation.mutate()}>
                          Reset
                        
                      
                    
                  
                
              )}
            
          )}

          {viewMode === 'edit' && (
            
              
                 setEditContent(e.target.value)}
                  className="h-full min-h-[400px] font-mono text-sm resize-none"
                  placeholder="Enter prompt content..."
                />
              
              
                Change Description (optional)
                 setChangeDescription(e.target.value)}
                  placeholder="What changed? e.g., 'Updated compliance language' (optional)"
                />
              
              
                {editContent.split('\n').length} lines
                {editContent.split(/\s+/).length} words
                {editContent.length.toLocaleString()} chars
              
            
          )}

          {viewMode === 'history' && (
            
              {isLoadingVersions ? (
                
                  
                
              ) : !versionHistory || versionHistory.length === 0 ? (
                
                  
                  No version history
                
              ) : (
                
                  
                    {versionHistory.map((version) => (
                       handleViewVersion(version.version)}
                      >
                        
                          
                            Version {version.version}
                            
                              {version.changeDescription}
                            
                          
                          
                            
                              {new Date(version.changedAt).toLocaleString()}
                              {version.changedByName && (
                                
                                  
                                  {version.changedByName}
                                
                              )}
                            
                          
                        
                        
                          {version.addedLines > 0 && (
                            +{version.addedLines}
                          )}
                          {version.removedLines > 0 && (
                            -{version.removedLines}
                          )}
                        
                      
                    ))}
                  
                
              )}
            
          )}
        
      
    );
  };

  // ==================== FILTER HELPERS ====================

  const clearFilters = () => {
    setFilterDepartment('');
    setFilterFunction('');
    setFilterPurpose('');
    setFilterModel('');
    setFilterStatus('');
    setFilterEntity('');
  };

  const hasActiveFilters = filterDepartment || filterFunction || filterPurpose || filterModel || filterStatus || filterEntity;

  // ==================== GOVERNANCE RENDER ====================

  const renderGovernanceTab = () => {
    if (!governanceData) {
      return (
        
          
        
      );
    }
    return (
      
        {/* Pending Drafts */}
        
          
            
              
              Pending Drafts ({governanceData.pendingDrafts.length})
            
            Prompts in draft status awaiting review
          
          
            
              {governanceData.pendingDrafts.length === 0 ? (
                No pending drafts
              ) : (
                
                  {governanceData.pendingDrafts.map(d => (
                    
                      {d.name}
                      {d.promptKey}
                    
                  ))}
                
              )}
            
          
        

        {/* Ownership Gaps */}
        
          
            
              
              Ownership Gaps ({governanceData.ownershipGaps.length})
            
            Prompts without assigned owners
          
          
            
              {governanceData.ownershipGaps.length === 0 ? (
                All prompts have owners
              ) : (
                
                  {governanceData.ownershipGaps.map(g => (
                    
                      
                        {g.name}
                        {g.promptKey}
                      
                      {g.department && {g.department}}
                    
                  ))}
                
              )}
            
          
        

        {/* Recent Changes */}
        
          
            
              
              Recent Changes (Last 30 Days)
            
          
          
            
              {governanceData.recentChanges.length === 0 ? (
                No recent changes
              ) : (
                
                  {governanceData.recentChanges.map(c => (
                    
                      
                        v{c.version}
                        {c.changeDescription || 'No description'}
                      
                      
                        {c.changedByName && {c.changedByName}}
                        {new Date(c.changedAt).toLocaleDateString()}
                      
                    
                  ))}
                
              )}
            
          
        

        {/* Deprecated */}
        {governanceData.deprecatedPrompts.length > 0 && (
          
            
              
                
                Deprecated Prompts ({governanceData.deprecatedPrompts.length})
              
            
            
              
                {governanceData.deprecatedPrompts.map(d => (
                  {d.promptKey}
                ))}
              
            
          
        )}
      
    );
  };

  // ==================== AUDIT RENDER ====================

  const renderAuditTab = () => {
    if (!auditData) {
      return (
        
          
        
      );
    }
    return (
      
        {/* Top stats */}
        
          
            
              {auditData.totalPrompts}
              Total Prompts
            
          
          
            
              {Object.keys(auditData.byDepartment).length}
              Departments
            
          
          
            
              {Object.keys(auditData.byModel).length}
              AI Models
            
          
          
            
              {auditData.unownedPrompts}
              Unowned
            
          
          
            
              {auditData.totalDependencies}
              Dependencies
            
          
        

        {/* Breakdown grids */}
        
          {/* By Department */}
          
            
              
                
                By Department
              
            
            
              
                {Object.entries(auditData.byDepartment).sort((a, b) => b[1] - a[1]).map(([dept, cnt]) => (
                  
                    {dept.replace('_', ' ')}
                    {cnt}
                  
                ))}
              
            
          

          {/* By Function */}
          
            
              
                
                By Function
              
            
            
              
                
                  {Object.entries(auditData.byFunction).sort((a, b) => b[1] - a[1]).map(([fn, cnt]) => (
                    
                      {fn.replace(/_/g, ' ')}
                      {cnt}
                    
                  ))}
                
              
            
          

          {/* By AI Model */}
          
            
              
                
                By AI Model
              
            
            
              
                {Object.entries(auditData.byModel).sort((a, b) => b[1] - a[1]).map(([model, cnt]) => (
                  
                    {model}
                    {cnt}
                  
                ))}
              
            
          

          {/* By Purpose */}
          
            
              
                
                By Purpose
              
            
            
              
                
                  {Object.entries(auditData.byPurpose).sort((a, b) => b[1] - a[1]).map(([purpose, cnt]) => (
                    
                      {purpose.replace(/_/g, ' ')}
                      {cnt}
                    
                  ))}
                
              
            
          

          {/* By Status */}
          
            
              
                
                By Status
              
            
            
              
                {Object.entries(auditData.byStatus).map(([status, cnt]) => (
                  
                    
                      
                      {status}
                    
                    {cnt}
                  
                ))}
              
            
          

          {/* By Category */}
          
            
              
                
                By Category
              
            
            
              
                {Object.entries(auditData.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => (
                  
                    
                      {categoryIcons[cat]}
                      {cat}
                    
                    {cnt}
                  
                ))}
              
            
          
        
      
    );
  };

  // ==================== MAIN RENDER ====================

  return (
    
      {/* Header */}
      
        
          
            
              
                
                Prompt Management System
              
              
                Centralized management for all AI agent prompts. Full transparency into how intelligence flows across the system.
              
            
            
              {auditData && (
                
                  {auditData.totalPrompts} prompts
                
              )}
              {stats && !auditData && (
                
                  {stats.total} prompts
                
              )}
               syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  
                ) : (
                  
                )}
                Sync from Codebase
              
            
          
        
      

      {/* Main Tabs */}
      
        
          
            
            Registry
          
          
            
            System Audit
          
          
            
            Governance
          
        

        {/* Registry Tab */}
        
          {/* Enhanced Filter Bar */}
          
            
              
                 setFilterDepartment(v === "__all__" ? "" : v)}>
                  
                    
                  
                  
                    All Departments
                    {departmentCounts && Object.entries(departmentCounts).map(([dept, cnt]) => (
                      {dept.replace(/_/g, ' ')} ({cnt})
                    ))}
                  
                
                 setFilterFunction(v === "__all__" ? "" : v)}>
                  
                    
                  
                  
                    All Functions
                    {functionCounts && Object.entries(functionCounts).map(([fn, cnt]) => (
                      {fn.replace(/_/g, ' ')} ({cnt})
                    ))}
                  
                
                 setFilterModel(v === "__all__" ? "" : v)}>
                  
                    
                  
                  
                    All Models
                    {modelCounts && Object.entries(modelCounts).map(([model, cnt]) => (
                      {model} ({cnt})
                    ))}
                  
                
                 setFilterStatus(v === "__all__" ? "" : v)}>
                  
                    
                  
                  
                    All Status
                    Live
                    Draft
                    Archived
                    Deprecated
                  
                
                 setFilterPurpose(v === "__all__" ? "" : v)}>
                  
                    
                  
                  
                    All Purposes
                    Generation
                    Classification
                    Analysis
                    Scoring
                    Routing
                    Enrichment
                    Orchestration
                    Extraction
                    Personalization
                    Summarization
                    Reasoning
                    Compliance
                  
                
                {hasActiveFilters && (
                  
                    
                    Clear filters
                  
                )}
              
            
          

          {/* Category Tabs */}
          
            
              {(categories || []).map((cat) => (
                
                  {categoryIcons[cat.id]}
                  {cat.name}
                  {stats?.byCategory[cat.id] && (
                    
                      {stats.byCategory[cat.id]}
                    
                  )}
                
              ))}
            
          

          {/* Main Content */}
          
            {/* Prompt List */}
            
              
                
                  
                    
                     setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  
                
                
                  
                    {renderPromptList()}
                  
                
              
            

            {/* Detail Panel */}
            
              {renderPromptDetail()}
            
          
        

        {/* System Audit Tab */}
        
          {renderAuditTab()}
        

        {/* Governance Tab */}
        
          {renderGovernanceTab()}
        
      

      {/* Version Detail Dialog */}
       setSelectedVersion(null)}>
        
          
            Version {selectedVersion?.version}
            
              {selectedVersion?.changeDescription}
              
                {selectedVersion?.changedAt && new Date(selectedVersion.changedAt).toLocaleString()}
                {selectedVersion?.changedByName && ` by ${selectedVersion.changedByName}`}
              
            
          
          
            
              
                {selectedVersion?.content}
              
            
          
          
             setSelectedVersion(null)}>
              Close
            
            
              
                
                  
                  Revert to This Version
                
              
              
                
                  Revert to Version {selectedVersion?.version}?
                  
                    This will create a new version with the content from version {selectedVersion?.version}.
                    The current content will be preserved in the version history.
                  
                
                
                  Cancel
                   selectedVersion && revertMutation.mutate(selectedVersion.version)}
                  >
                    Revert
                  
                
              
            
          
        
      
    
  );
}