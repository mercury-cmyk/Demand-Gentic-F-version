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
  promptKey: string;
  name: string;
  description: string | null;
  promptType: string;
  promptScope: string;
  agentType: string | null;
  category: string | null;
  isActive: boolean;
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

interface PromptDetail extends PromptListItem {
  content: string;
  defaultContent: string;
  isLocked: boolean;
  priority: number;
  tags: string[];
  sourceFile: string | null;
  sourceLine: number | null;
  sourceExport: string | null;
  createdAt: string;
  createdByName: string | null;
}

interface PromptVersionItem {
  id: string;
  version: number;
  changeDescription: string;
  changedAt: string;
  changedByName: string | null;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
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
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  recentlyUpdated: number;
}

interface SystemAudit {
  totalPrompts: number;
  byDepartment: Record<string, number>;
  byFunction: Record<string, number>;
  byModel: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  byPurpose: Record<string, number>;
  unownedPrompts: number;
  draftPrompts: number;
  totalDependencies: number;
}

interface GovernanceData {
  pendingDrafts: Array<{ id: string; name: string; promptKey: string; updatedAt: string }>;
  recentChanges: Array<{ id: string; promptId: string; version: number; changeDescription: string | null; changedAt: string; changedByName: string | null }>;
  ownershipGaps: Array<{ id: string; name: string; promptKey: string; department: string | null }>;
  deprecatedPrompts: Array<{ id: string; name: string; promptKey: string }>;
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

const categoryIcons: Record<string, React.ReactNode> = {
  voice: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  intelligence: <Brain className="h-4 w-4" />,
  compliance: <Shield className="h-4 w-4" />,
  system: <Settings className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
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
  const [mainTab, setMainTab] = useState<string>('registry');
  const [selectedCategory, setSelectedCategory] = useState<string>('voice');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'history'>('view');
  const [editContent, setEditContent] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<PromptVersionDetail | null>(null);
  // Enhanced filters
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [filterFunction, setFilterFunction] = useState<string>('');
  const [filterPurpose, setFilterPurpose] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');

  // Only allow admins
  if (!user || user.role !== 'admin') {
    return <Redirect to="/" />;
  }

  // ==================== QUERIES ====================

  const { data: categories } = useQuery<PromptCategory[]>({
    queryKey: ['/api/prompts/categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/categories');
      const data = await res.json();
      return data.categories || data;
    },
  });

  const { data: stats } = useQuery<PromptStats>({
    queryKey: ['/api/prompts/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/stats');
      return res.json();
    },
  });

  const { data: prompts, isLoading: isLoadingPrompts } = useQuery<PromptListItem[]>({
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
      return data.prompts || data;
    },
  });

  // Governance & Audit queries
  const { data: auditData } = useQuery<SystemAudit>({
    queryKey: ['/api/prompts/audit'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/audit');
      const data = await res.json();
      return data.audit;
    },
    enabled: mainTab === 'audit' || mainTab === 'registry',
  });

  const { data: governanceData } = useQuery<GovernanceData>({
    queryKey: ['/api/prompts/governance'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/governance');
      return res.json();
    },
    enabled: mainTab === 'governance',
  });

  const { data: departmentCounts } = useQuery<Record<string, number>>({
    queryKey: ['/api/prompts/departments'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/departments');
      const data = await res.json();
      return data.departments;
    },
  });

  const { data: functionCounts } = useQuery<Record<string, number>>({
    queryKey: ['/api/prompts/functions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/functions');
      const data = await res.json();
      return data.functions;
    },
  });

  const { data: modelCounts } = useQuery<Record<string, number>>({
    queryKey: ['/api/prompts/models'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prompts/models');
      const data = await res.json();
      return data.models;
    },
  });

  const { data: promptDependencies } = useQuery<PromptDependency[]>({
    queryKey: ['/api/prompts/dependencies', selectedPromptId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/prompts/dependencies/${selectedPromptId}`);
      const data = await res.json();
      return data.dependencies;
    },
    enabled: !!selectedPromptId,
  });

  const { data: selectedPrompt, isLoading: isLoadingPrompt } = useQuery<PromptDetail>({
    queryKey: ['/api/prompts', selectedPromptId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/prompts/${selectedPromptId}`);
      const data = await res.json();
      return data.prompt || data;
    },
    enabled: !!selectedPromptId,
  });

  const { data: versionHistory, isLoading: isLoadingVersions } = useQuery<PromptVersionItem[]>({
    queryKey: ['/api/prompts', selectedPromptId, 'versions'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/prompts/${selectedPromptId}/versions`);
      const data = await res.json();
      return data.versions || data;
    },
    enabled: !!selectedPromptId && viewMode === 'history',
  });

  // ==================== MUTATIONS ====================

  const updateMutation = useMutation({
    mutationFn: async (data: { content: string; changeDescription: string }) => {
      const res = await apiRequest('PUT', `/api/prompts/${selectedPromptId}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      setViewMode('view');
      setChangeDescription('');
      toast({
        title: 'Prompt Updated',
        description: `Version ${data.version} saved successfully.`,
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
      const res = await apiRequest('POST', `/api/prompts/${selectedPromptId}/reset`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
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
      const res = await apiRequest('POST', `/api/prompts/${selectedPromptId}/revert/${version}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompts'] });
      setSelectedVersion(null);
      toast({
        title: 'Reverted',
        description: `Prompt reverted to version ${data.version - 1}.`,
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
        description: `${data.created} created, ${data.updated} updated, ${data.skipped} unchanged.`,
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
    if (!changeDescription.trim()) {
      toast({
        title: 'Description Required',
        description: 'Please describe what changed.',
        variant: 'destructive',
      });
      return;
    }
    updateMutation.mutate({
      content: editContent,
      changeDescription: changeDescription.trim(),
    });
  };

  const handleViewVersion = async (version: number) => {
    try {
      const res = await apiRequest('GET', `/api/prompts/${selectedPromptId}/versions/${version}`);
      const versionDetail = await res.json();
      setSelectedVersion(versionDetail);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load version details.',
        variant: 'destructive',
      });
    }
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
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!prompts || prompts.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No prompts found</p>
          <p className="text-sm">Click "Sync from Codebase" to import prompts</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            onClick={() => handleSelectPrompt(prompt)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedPromptId === prompt.id
                ? 'bg-primary/10 border-primary'
                : 'hover:bg-muted/50 border-transparent'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{prompt.name}</div>
                <div className="text-xs text-muted-foreground truncate">{prompt.promptKey}</div>
              </div>
              <div className="flex items-center gap-1">
                {prompt.isActive ? (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>v{prompt.version}</span>
              <span>|</span>
              <Clock className="h-3 w-3" />
              <span>{new Date(prompt.updatedAt).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderPromptDetail = () => {
    if (!selectedPromptId) {
      return (
        <Card className="h-full">
          <CardContent className="pt-6">
            <div className="text-center py-16 text-muted-foreground">
              <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a prompt to view</p>
              <p className="text-sm">Choose a prompt from the list to see its details</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (isLoadingPrompt) {
      return (
        <Card className="h-full">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!selectedPrompt) {
      return (
        <Card className="h-full">
          <CardContent className="pt-6">
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Prompt not found</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{selectedPrompt.name}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{selectedPrompt.promptKey}</code>
                <span>|</span>
                <span>v{selectedPrompt.version}</span>
                {selectedPrompt.updatedByName && (
                  <>
                    <span>|</span>
                    <User className="h-3 w-3" />
                    <span>{selectedPrompt.updatedByName}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'view' && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" onClick={handleCopyContent}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy content</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" onClick={() => setViewMode('history')}>
                    <History className="h-4 w-4 mr-1" />
                    History
                  </Button>
                  <Button size="sm" onClick={handleStartEdit} disabled={selectedPrompt.isLocked}>
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </>
              )}
              {viewMode === 'edit' && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={updateMutation.isPending || !changeDescription.trim()}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              )}
              {viewMode === 'history' && (
                <Button variant="outline" size="sm" onClick={() => setViewMode('view')}>
                  <Eye className="h-4 w-4 mr-1" />
                  View Current
                </Button>
              )}
            </div>
          </div>
          {selectedPrompt.description && (
            <CardDescription className="mt-2">{selectedPrompt.description}</CardDescription>
          )}
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'view' && (
            <>
              {/* Metadata badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="outline" className={categoryColors[selectedPrompt.category || 'system']}>
                  {categoryIcons[selectedPrompt.category || 'system']}
                  <span className="ml-1 capitalize">{selectedPrompt.category || 'system'}</span>
                </Badge>
                <Badge variant="outline">{selectedPrompt.promptType}</Badge>
                <Badge variant="outline">{selectedPrompt.promptScope}</Badge>
                {selectedPrompt.tags?.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Dependencies section */}
              {promptDependencies && promptDependencies.length > 0 && (
                <div className="mb-4 p-3 rounded-lg border bg-muted/30">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Dependencies ({promptDependencies.length})
                  </div>
                  <div className="space-y-1">
                    {promptDependencies.map((dep) => (
                      <div key={dep.id} className="flex items-center gap-2 text-xs">
                        <Badge variant={dep.direction === 'produces' ? 'default' : 'secondary'} className="text-xs">
                          {dep.direction}
                        </Badge>
                        <code className="bg-muted px-1 rounded">{dep.entityName}</code>
                        {dep.endpointPath && (
                          <>
                            <ArrowRight className="h-3 w-3" />
                            <code className="bg-muted px-1 rounded">{dep.httpMethod} {dep.endpointPath}</code>
                          </>
                        )}
                        <span className="text-muted-foreground">({dep.serviceFunction})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content viewer */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-[500px] rounded-md border bg-muted/30">
                  <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                    {selectedPrompt.content}
                  </pre>
                </ScrollArea>
              </div>

              {/* Stats footer */}
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground border-t pt-3">
                <span>{selectedPrompt.content.split('\n').length} lines</span>
                <span>{selectedPrompt.content.split(/\s+/).length} words</span>
                <span>{selectedPrompt.content.length.toLocaleString()} chars</span>
                <span>~{Math.ceil(selectedPrompt.content.length / 4).toLocaleString()} tokens</span>
              </div>

              {/* Source info */}
              {selectedPrompt.sourceFile && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Source: <code className="bg-muted px-1 rounded">{selectedPrompt.sourceFile}</code>
                  {selectedPrompt.sourceLine && `:${selectedPrompt.sourceLine}`}
                </div>
              )}

              {/* Reset button */}
              {selectedPrompt.content !== selectedPrompt.defaultContent && (
                <div className="mt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reset to Default
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will replace the current content with the original default from the codebase.
                          A new version will be created for tracking purposes.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => resetMutation.mutate()}>
                          Reset
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          )}

          {viewMode === 'edit' && (
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex-1">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="h-full min-h-[400px] font-mono text-sm resize-none"
                  placeholder="Enter prompt content..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="changeDescription">Change Description (required)</Label>
                <Input
                  id="changeDescription"
                  value={changeDescription}
                  onChange={(e) => setChangeDescription(e.target.value)}
                  placeholder="What changed? e.g., 'Updated compliance language'"
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{editContent.split('\n').length} lines</span>
                <span>{editContent.split(/\s+/).length} words</span>
                <span>{editContent.length.toLocaleString()} chars</span>
              </div>
            </div>
          )}

          {viewMode === 'history' && (
            <div className="flex-1 overflow-hidden">
              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !versionHistory || versionHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No version history</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2 pr-4">
                    {versionHistory.map((version) => (
                      <div
                        key={version.id}
                        className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleViewVersion(version.version)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">Version {version.version}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {version.changeDescription}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground text-right">
                              <div>{new Date(version.changedAt).toLocaleString()}</div>
                              {version.changedByName && (
                                <div className="flex items-center justify-end gap-1">
                                  <User className="h-3 w-3" />
                                  {version.changedByName}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          {version.addedLines > 0 && (
                            <span className="text-green-600">+{version.addedLines}</span>
                          )}
                          {version.removedLines > 0 && (
                            <span className="text-red-600">-{version.removedLines}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>
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
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-6">
        {/* Pending Drafts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-yellow-600" />
              Pending Drafts ({governanceData.pendingDrafts.length})
            </CardTitle>
            <CardDescription>Prompts in draft status awaiting review</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              {governanceData.pendingDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No pending drafts</p>
              ) : (
                <div className="space-y-2">
                  {governanceData.pendingDrafts.map(d => (
                    <div key={d.id} className="p-2 rounded border text-sm">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.promptKey}</div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Ownership Gaps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Ownership Gaps ({governanceData.ownershipGaps.length})
            </CardTitle>
            <CardDescription>Prompts without assigned owners</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              {governanceData.ownershipGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">All prompts have owners</p>
              ) : (
                <div className="space-y-2">
                  {governanceData.ownershipGaps.map(g => (
                    <div key={g.id} className="p-2 rounded border text-sm flex items-center justify-between">
                      <div>
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.promptKey}</div>
                      </div>
                      {g.department && <Badge variant="outline" className="text-xs">{g.department}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Changes */}
        <Card className="col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-blue-600" />
              Recent Changes (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {governanceData.recentChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent changes</p>
              ) : (
                <div className="space-y-2">
                  {governanceData.recentChanges.map(c => (
                    <div key={c.id} className="p-3 rounded border text-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">v{c.version}</Badge>
                        <span>{c.changeDescription || 'No description'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {c.changedByName && <span>{c.changedByName}</span>}
                        <span>{new Date(c.changedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Deprecated */}
        {governanceData.deprecatedPrompts.length > 0 && (
          <Card className="col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="h-4 w-4 text-gray-500" />
                Deprecated Prompts ({governanceData.deprecatedPrompts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {governanceData.deprecatedPrompts.map(d => (
                  <Badge key={d.id} variant="secondary" className="text-xs">{d.promptKey}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // ==================== AUDIT RENDER ====================

  const renderAuditTab = () => {
    if (!auditData) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {/* Top stats */}
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-primary">{auditData.totalPrompts}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Prompts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{Object.keys(auditData.byDepartment).length}</div>
              <div className="text-xs text-muted-foreground mt-1">Departments</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-green-600">{Object.keys(auditData.byModel).length}</div>
              <div className="text-xs text-muted-foreground mt-1">AI Models</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{auditData.unownedPrompts}</div>
              <div className="text-xs text-muted-foreground mt-1">Unowned</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{auditData.totalDependencies}</div>
              <div className="text-xs text-muted-foreground mt-1">Dependencies</div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown grids */}
        <div className="grid grid-cols-3 gap-6">
          {/* By Department */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                By Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(auditData.byDepartment).sort((a, b) => b[1] - a[1]).map(([dept, cnt]) => (
                  <div key={dept} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{dept.replace('_', ' ')}</span>
                    <Badge variant="secondary">{cnt}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Function */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                By Function
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {Object.entries(auditData.byFunction).sort((a, b) => b[1] - a[1]).map(([fn, cnt]) => (
                    <div key={fn} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{fn.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{cnt}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* By AI Model */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" />
                By AI Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(auditData.byModel).sort((a, b) => b[1] - a[1]).map(([model, cnt]) => (
                  <div key={model} className="flex items-center justify-between text-sm">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{model}</code>
                    <Badge variant="secondary">{cnt}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Purpose */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                By Purpose
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {Object.entries(auditData.byPurpose).sort((a, b) => b[1] - a[1]).map(([purpose, cnt]) => (
                    <div key={purpose} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{purpose.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{cnt}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* By Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                By Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(auditData.byStatus).map(([status, cnt]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${status === 'live' ? 'bg-green-500' : status === 'draft' ? 'bg-yellow-500' : status === 'archived' ? 'bg-gray-400' : 'bg-red-400'}`} />
                      <span className="capitalize">{status}</span>
                    </div>
                    <Badge variant="secondary">{cnt}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Category */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                By Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(auditData.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {categoryIcons[cat]}
                      <span className="capitalize">{cat}</span>
                    </div>
                    <Badge variant="secondary">{cnt}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ==================== MAIN RENDER ====================

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Code className="h-6 w-6 text-primary" />
                Prompt Management System
              </CardTitle>
              <CardDescription>
                Centralized management for all AI agent prompts. Full transparency into how intelligence flows across the system.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {auditData && (
                <Badge variant="outline" className="text-sm">
                  {auditData.totalPrompts} prompts
                </Badge>
              )}
              {stats && !auditData && (
                <Badge variant="outline" className="text-sm">
                  {stats.total} prompts
                </Badge>
              )}
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync from Codebase
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="w-full justify-start bg-muted/50 p-1">
          <TabsTrigger value="registry" className="gap-2">
            <Code className="h-4 w-4" />
            Registry
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            System Audit
          </TabsTrigger>
          <TabsTrigger value="governance" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Governance
          </TabsTrigger>
        </TabsList>

        {/* Registry Tab */}
        <TabsContent value="registry" className="space-y-4">
          {/* Enhanced Filter Bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={filterDepartment || "__all__"} onValueChange={(v) => setFilterDepartment(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Departments</SelectItem>
                    {departmentCounts && Object.entries(departmentCounts).map(([dept, cnt]) => (
                      <SelectItem key={dept} value={dept}>{dept.replace(/_/g, ' ')} ({cnt})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterFunction || "__all__"} onValueChange={(v) => setFilterFunction(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Function" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Functions</SelectItem>
                    {functionCounts && Object.entries(functionCounts).map(([fn, cnt]) => (
                      <SelectItem key={fn} value={fn}>{fn.replace(/_/g, ' ')} ({cnt})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterModel || "__all__"} onValueChange={(v) => setFilterModel(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="AI Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Models</SelectItem>
                    {modelCounts && Object.entries(modelCounts).map(([model, cnt]) => (
                      <SelectItem key={model} value={model}>{model} ({cnt})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Status</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterPurpose || "__all__"} onValueChange={(v) => setFilterPurpose(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Purposes</SelectItem>
                    <SelectItem value="generation">Generation</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    <SelectItem value="scoring">Scoring</SelectItem>
                    <SelectItem value="routing">Routing</SelectItem>
                    <SelectItem value="enrichment">Enrichment</SelectItem>
                    <SelectItem value="orchestration">Orchestration</SelectItem>
                    <SelectItem value="extraction">Extraction</SelectItem>
                    <SelectItem value="personalization">Personalization</SelectItem>
                    <SelectItem value="summarization">Summarization</SelectItem>
                    <SelectItem value="reasoning">Reasoning</SelectItem>
                    <SelectItem value="compliance_check">Compliance</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                    <X className="h-3 w-3 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Tabs */}
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="w-full justify-start">
              {(categories || []).map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id} className="gap-2">
                  {categoryIcons[cat.id]}
                  {cat.name}
                  {stats?.byCategory[cat.id] && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {stats.byCategory[cat.id]}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Main Content */}
          <div className="grid grid-cols-12 gap-6">
            {/* Prompt List */}
            <div className="col-span-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search prompts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    {renderPromptList()}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Detail Panel */}
            <div className="col-span-8">
              {renderPromptDetail()}
            </div>
          </div>
        </TabsContent>

        {/* System Audit Tab */}
        <TabsContent value="audit">
          {renderAuditTab()}
        </TabsContent>

        {/* Governance Tab */}
        <TabsContent value="governance">
          {renderGovernanceTab()}
        </TabsContent>
      </Tabs>

      {/* Version Detail Dialog */}
      <Dialog open={!!selectedVersion} onOpenChange={() => setSelectedVersion(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Version {selectedVersion?.version}</DialogTitle>
            <DialogDescription>
              {selectedVersion?.changeDescription}
              <div className="mt-1 text-xs">
                {selectedVersion?.changedAt && new Date(selectedVersion.changedAt).toLocaleString()}
                {selectedVersion?.changedByName && ` by ${selectedVersion.changedByName}`}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-[400px] rounded-md border bg-muted/30">
              <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                {selectedVersion?.content}
              </pre>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedVersion(null)}>
              Close
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <Undo2 className="h-4 w-4 mr-1" />
                  Revert to This Version
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revert to Version {selectedVersion?.version}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new version with the content from version {selectedVersion?.version}.
                    The current content will be preserved in the version history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => selectedVersion && revertMutation.mutate(selectedVersion.version)}
                  >
                    Revert
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
