/**
 * Prompt Management Page
 *
 * CENTRALIZED UI for managing ALL AI agent prompts.
 *
 * Features:
 * - Browse by category (Voice, Email, Intelligence, Compliance, System)
 * - Search and filter prompts
 * - Edit with rich markdown preview
 * - Version history with diff view
 * - Sync from codebase defaults
 * - Preview compiled prompts with context
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
  const [selectedCategory, setSelectedCategory] = useState<string>('voice');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'history'>('view');
  const [editContent, setEditContent] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<PromptVersionDetail | null>(null);

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
    queryKey: ['/api/prompts', selectedCategory, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (searchQuery) params.set('search', searchQuery);
      const res = await apiRequest('GET', `/api/prompts?${params}`);
      const data = await res.json();
      return data.prompts || data;
    },
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
                Centralized management for all AI agent prompts. Edit, track versions, and deploy changes across the system.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {stats && (
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

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-6">
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
