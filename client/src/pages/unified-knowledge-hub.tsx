/**
 * Unified Knowledge Hub Page
 * 
 * SINGLE SOURCE OF TRUTH for all AI agent knowledge.
 * 
 * This page provides:
 * - Comprehensive knowledge section management
 * - Version history with diff tracking
 * - Simulation/preview capabilities
 * - Runtime prompt viewer
 * - Visual change indicators (red/green diffs)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Save,
  RotateCcw,
  Brain,
  FileText,
  History,
  Play,
  Eye,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Trash2,
  GitCompare,
  RefreshCw,
  Code,
  Shield,
  Phone,
  MessageSquare,
  Target,
  Zap,
  Settings2
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import { KnowledgeDiffViewer } from '@/components/knowledge-hub/knowledge-diff-viewer';

// ==================== TYPES ====================

interface KnowledgeSection {
  id: string;
  category: string;
  title: string;
  content: string;
  priority: number;
  isActive: boolean;
  tags: string[];
}

interface UnifiedKnowledge {
  id: string;
  version: number;
  sections: KnowledgeSection[];
  sectionsByCategory: Record<string, KnowledgeSection[]>;
  categoryOrder: string[];
  metadata: {
    lastUpdatedBy: string | null;
    lastUpdatedAt: string;
    changeDescription: string | null;
  };
}

interface KnowledgeCategory {
  id: string;
  name: string;
  description: string;
  priority: number;
}

interface VersionHistoryItem {
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  changeDescription: string | null;
}

interface DiffResult {
  additions: { sectionId: string; content: string }[];
  removals: { sectionId: string; content: string }[];
  modifications: { sectionId: string; oldContent: string; newContent: string }[];
}

// ==================== CATEGORY ICONS ====================

const categoryIcons: Record<string, React.ReactNode> = {
  compliance: <Shield className="h-4 w-4" />,
  identity_verification: <CheckCircle2 className="h-4 w-4" />,
  gatekeeper_handling: <Phone className="h-4 w-4" />,
  voicemail_detection: <MessageSquare className="h-4 w-4" />,
  call_dispositioning: <Target className="h-4 w-4" />,
  call_quality: <Zap className="h-4 w-4" />,
  conversation_flow: <RefreshCw className="h-4 w-4" />,
  tone_and_pacing: <Settings2 className="h-4 w-4" />,
  dos_and_donts: <AlertCircle className="h-4 w-4" />,
  objection_handling: <MessageSquare className="h-4 w-4" />,
  call_control: <Phone className="h-4 w-4" />,
  learning_rules: <Brain className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  compliance: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
  identity_verification: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800',
  gatekeeper_handling: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  voicemail_detection: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
  call_dispositioning: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
  call_quality: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
  conversation_flow: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800',
  tone_and_pacing: 'bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800',
  dos_and_donts: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800',
  objection_handling: 'bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800',
  call_control: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
  learning_rules: 'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800',
};

// ==================== MAIN COMPONENT ====================

export default function UnifiedKnowledgeHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState('knowledge');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['compliance']));
  const [editingSections, setEditingSections] = useState<Map<string, KnowledgeSection>>(new Map());
  const [changeDescription, setChangeDescription] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{ a: number; b: number } | null>(null);

  // Only allow admins/campaign_managers
  if (!user || (user.role !== 'admin' && user.role !== 'campaign_manager')) {
    return <Redirect to="/" />;
  }

  // ==================== QUERIES ====================

  const { data: knowledge, isLoading: isLoadingKnowledge } = useQuery<UnifiedKnowledge>({
    queryKey: ['/api/knowledge-hub'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub');
      return res.json();
    },
  });

  const { data: categories } = useQuery<{ categories: KnowledgeCategory[] }>({
    queryKey: ['/api/knowledge-hub/categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/categories');
      return res.json();
    },
  });

  const { data: versionHistory } = useQuery<{ versions: VersionHistoryItem[] }>({
    queryKey: ['/api/knowledge-hub/versions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/versions');
      return res.json();
    },
  });

  const { data: promptPreview, isLoading: isLoadingPreview, refetch: refetchPreview } = useQuery<{
    compiledPrompt: string;
    knowledgeVersion: number;
    promptLength: number;
    estimatedTokens: number;
    sectionsIncluded: number;
  }>({
    queryKey: ['/api/knowledge-hub/prompt-preview'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/prompt-preview');
      return res.json();
    },
    enabled: showPromptPreview,
  });

  // Diff comparison query
  const { data: diffResult, isLoading: isLoadingDiff } = useQuery<DiffResult>({
    queryKey: ['/api/knowledge-hub/compare', compareVersions?.a, compareVersions?.b],
    queryFn: async () => {
      if (!compareVersions) return null;
      const res = await apiRequest('POST', '/api/knowledge-hub/compare', {
        versionA: compareVersions.a,
        versionB: compareVersions.b,
      });
      const data = await res.json();
      return data.diff;
    },
    enabled: !!compareVersions,
  });

  // ==================== MUTATIONS ====================

  const updateMutation = useMutation({
    mutationFn: async (data: { sections: KnowledgeSection[]; changeDescription: string }) => {
      const res = await apiRequest('PUT', '/api/knowledge-hub', data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-hub'] });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-hub/versions'] });
      setEditingSections(new Map());
      setHasChanges(false);
      setChangeDescription('');
      toast({
        title: 'Knowledge Updated',
        description: `Version ${data.knowledge.version} saved successfully.`,
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
      const res = await apiRequest('POST', '/api/knowledge-hub/reset', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-hub'] });
      queryClient.invalidateQueries({ queryKey: ['/api/knowledge-hub/versions'] });
      setEditingSections(new Map());
      setHasChanges(false);
      toast({
        title: 'Reset Complete',
        description: 'Knowledge has been reset to system defaults.',
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

  // ==================== HANDLERS ====================

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const startEditing = (section: KnowledgeSection) => {
    setEditingSections(prev => new Map(prev).set(section.id, { ...section }));
    setHasChanges(true);
  };

  const updateEditingSection = (sectionId: string, updates: Partial<KnowledgeSection>) => {
    setEditingSections(prev => {
      const next = new Map(prev);
      const current = next.get(sectionId);
      if (current) {
        next.set(sectionId, { ...current, ...updates });
      }
      return next;
    });
    setHasChanges(true);
  };

  const cancelEditing = (sectionId: string) => {
    setEditingSections(prev => {
      const next = new Map(prev);
      next.delete(sectionId);
      return next;
    });
    if (editingSections.size <= 1) {
      setHasChanges(false);
    }
  };

  const saveAllChanges = () => {
    if (!knowledge || !changeDescription.trim()) {
      toast({
        title: 'Description Required',
        description: 'Please describe what changed.',
        variant: 'destructive',
      });
      return;
    }

    // Merge edits with original sections
    const updatedSections = knowledge.sections.map(section => {
      const edited = editingSections.get(section.id);
      return edited || section;
    });

    updateMutation.mutate({
      sections: updatedSections,
      changeDescription: changeDescription.trim(),
    });
  };

  const toggleSectionActive = (sectionId: string) => {
    const section = knowledge?.sections.find(s => s.id === sectionId);
    if (section) {
      const edited = editingSections.get(sectionId) || { ...section };
      updateEditingSection(sectionId, { isActive: !edited.isActive });
    }
  };

  // ==================== RENDER ====================

  if (isLoadingKnowledge) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-6 w-6 text-primary" />
                Unified Knowledge Hub
              </CardTitle>
              <CardDescription>
                Single source of truth for all AI agent knowledge. All agents consume knowledge from this centralized hub only.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {knowledge && (
                <Badge variant="outline" className="text-sm">
                  Version {knowledge.version}
                </Badge>
              )}
              {hasChanges && (
                <Badge variant="destructive" className="text-sm">
                  Unsaved Changes
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Architectural Requirement
              </p>
              <p className="text-xs text-muted-foreground">
                All AI agents—voice, email, compliance, or otherwise—must consume knowledge from this unified source only.
                No other routes, documents, or hidden configurations are permitted.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="knowledge" className="gap-2">
            <FileText className="h-4 w-4" />
            Knowledge Sections
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Prompt Preview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Version History
          </TabsTrigger>
          <TabsTrigger value="simulate" className="gap-2">
            <Play className="h-4 w-4" />
            Simulate
          </TabsTrigger>
        </TabsList>

        {/* Knowledge Sections Tab */}
        <TabsContent value="knowledge" className="space-y-4">
          {knowledge?.categoryOrder.map(categoryId => {
            const categorySections = knowledge.sectionsByCategory[categoryId] || [];
            const categoryInfo = categories?.categories.find(c => c.id === categoryId);
            const isExpanded = expandedCategories.has(categoryId);

            return (
              <Card key={categoryId} className={`border-2 ${categoryColors[categoryId] || ''}`}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(categoryId)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          {categoryIcons[categoryId]}
                          <div>
                            <CardTitle className="text-base">{categoryInfo?.name || categoryId}</CardTitle>
                            <CardDescription className="text-xs">
                              {categoryInfo?.description}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {categorySections.filter(s => s.isActive).length}/{categorySections.length} active
                          </Badge>
                          <Badge variant="outline">Priority: {categoryInfo?.priority || 0}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-0">
                      {categorySections.map(section => {
                        const isEditing = editingSections.has(section.id);
                        const editedSection = editingSections.get(section.id) || section;

                        return (
                          <div
                            key={section.id}
                            className={`rounded-lg border p-4 ${
                              isEditing
                                ? 'border-primary bg-primary/5'
                                : section.isActive
                                ? 'bg-card'
                                : 'bg-muted/50 opacity-60'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{section.title}</h4>
                                {!section.isActive && (
                                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                                )}
                                {isEditing && (
                                  <Badge variant="default" className="text-xs">Editing</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={editedSection.isActive}
                                  onCheckedChange={() => toggleSectionActive(section.id)}
                                />
                                {isEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => cancelEditing(section.id)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => startEditing(section)}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </div>

                            {isEditing ? (
                              <Textarea
                                value={editedSection.content}
                                onChange={e =>
                                  updateEditingSection(section.id, { content: e.target.value })
                                }
                                className="min-h-[300px] font-mono text-sm"
                              />
                            ) : (
                              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 rounded p-3 max-h-[200px] overflow-y-auto">
                                {section.content.substring(0, 500)}
                                {section.content.length > 500 && '...'}
                              </pre>
                            )}

                            {section.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-2">
                                {section.tags.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}

          {/* Save Changes Panel */}
          {hasChanges && (
            <Card className="border-primary">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="changeDescription">Change Description (Required)</Label>
                    <Input
                      id="changeDescription"
                      value={changeDescription}
                      onChange={e => setChangeDescription(e.target.value)}
                      placeholder="Describe what changed..."
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {editingSections.size} section(s) modified
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingSections(new Map());
                          setHasChanges(false);
                          setChangeDescription('');
                        }}
                      >
                        Discard All
                      </Button>
                      <Button
                        onClick={saveAllChanges}
                        disabled={updateMutation.isPending || !changeDescription.trim()}
                      >
                        {updateMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes (v{(knowledge?.version || 0) + 1})
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reset Button */}
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to System Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to System Defaults?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace all knowledge sections with the original system defaults.
                    A new version will be created for tracking. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset to Defaults
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TabsContent>

        {/* Prompt Preview Tab */}
        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Runtime Prompt Preview</CardTitle>
                  <CardDescription>
                    View the exact prompt that agents receive at runtime
                  </CardDescription>
                </div>
                <Button onClick={() => {
                  setShowPromptPreview(true);
                  refetchPreview();
                }}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Preview
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : promptPreview ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{promptPreview.knowledgeVersion}</div>
                        <div className="text-xs text-muted-foreground">Knowledge Version</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{promptPreview.sectionsIncluded}</div>
                        <div className="text-xs text-muted-foreground">Sections Included</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{promptPreview.promptLength.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Characters</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">~{promptPreview.estimatedTokens.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Est. Tokens</div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-2">
                    <Label>Compiled Prompt</Label>
                    <ScrollArea className="h-[500px] rounded-lg border bg-muted/30">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                        {promptPreview.compiledPrompt}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Click "Refresh Preview" to generate the runtime prompt</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Version History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Version History</CardTitle>
                  <CardDescription>
                    Track changes and compare versions with visual diffs
                  </CardDescription>
                </div>
                {compareVersions && (
                  <Button variant="outline" onClick={() => setCompareVersions(null)}>
                    Back to History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Show Diff Viewer when comparing */}
              {compareVersions ? (
                isLoadingDiff ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2 text-muted-foreground">Loading comparison...</span>
                  </div>
                ) : diffResult ? (
                  <KnowledgeDiffViewer
                    diff={diffResult}
                    versionA={compareVersions.a}
                    versionB={compareVersions.b}
                    onClose={() => setCompareVersions(null)}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Unable to load comparison data</p>
                    <Button variant="outline" className="mt-4" onClick={() => setCompareVersions(null)}>
                      Back to History
                    </Button>
                  </div>
                )
              ) : (
                /* Version List */
                versionHistory?.versions && versionHistory.versions.length > 0 ? (
                  <div className="space-y-3">
                    {versionHistory.versions.map((version, index) => (
                      <div
                        key={version.version}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          index === 0 ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Badge variant={index === 0 ? 'default' : 'secondary'}>
                            v{version.version}
                          </Badge>
                          <div>
                            <div className="font-medium">
                              {version.changeDescription || 'No description'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(version.updatedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {index === 0 && (
                          <Badge variant="outline">Current</Badge>
                        )}
                        {index > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCompareVersions({ a: version.version, b: versionHistory.versions[0].version })}
                          >
                            <GitCompare className="h-4 w-4 mr-1" />
                            Compare with Current
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No version history yet</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Simulate Tab */}
        <TabsContent value="simulate">
          <SimulationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== SIMULATION PANEL COMPONENT ====================

function SimulationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [campaignId, setCampaignId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [contactId, setContactId] = useState('');
  const [simulationType, setSimulationType] = useState<'voice' | 'email' | 'text'>('voice');
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const { data: campaigns } = useQuery({
    queryKey: ['/api/campaigns'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/campaigns?limit=50');
      return res.json();
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['/api/accounts'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/accounts?limit=50');
      return res.json();
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/knowledge-hub/simulate', data);
      return res.json();
    },
    onSuccess: (data) => {
      setSimulationResult(data);
      toast({
        title: 'Simulation Complete',
        description: 'Runtime prompt generated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Simulation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runSimulation = () => {
    simulateMutation.mutate({
      campaignId: campaignId || undefined,
      accountId: accountId || undefined,
      contactId: contactId || undefined,
      simulationType,
      simulationMode: 'preview',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Agent Simulation & Preview</CardTitle>
          <CardDescription>
            Select context and run simulations to preview exact runtime prompts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Campaign (Optional)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {campaigns?.campaigns?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account (Optional)</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {accounts?.accounts?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Simulation Type</Label>
              <Select value={simulationType} onValueChange={(v: any) => setSimulationType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voice">Voice Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="text">Text Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={runSimulation} disabled={simulateMutation.isPending}>
            {simulateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Simulation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {simulationResult && (
        <Card>
          <CardHeader>
            <CardTitle>Simulation Result</CardTitle>
            <CardDescription>
              Knowledge Version: {simulationResult.prompt?.knowledgeVersion} |
              Prompt Length: {simulationResult.prompt?.promptLength.toLocaleString()} chars |
              Est. Tokens: ~{simulationResult.prompt?.estimatedTokens.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {simulationResult.context?.campaign && (
                  <Badge variant="outline">Campaign: {simulationResult.context.campaign.name}</Badge>
                )}
                {simulationResult.context?.account && (
                  <Badge variant="outline">Account: {simulationResult.context.account.name}</Badge>
                )}
                {simulationResult.context?.contact && (
                  <Badge variant="outline">Contact: {simulationResult.context.contact.name}</Badge>
                )}
                {simulationResult.context?.agent && (
                  <Badge variant="outline">Agent: {simulationResult.context.agent.name}</Badge>
                )}
              </div>

              <div className="space-y-2">
                <Label>Runtime Prompt (Full)</Label>
                <ScrollArea className="h-[400px] rounded-lg border bg-muted/30">
                  <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                    {simulationResult.prompt?.runtimePrompt}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
