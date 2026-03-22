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
  sectionsByCategory: Record;
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

const categoryIcons: Record = {
  compliance: ,
  identity_verification: ,
  gatekeeper_handling: ,
  voicemail_detection: ,
  call_dispositioning: ,
  call_quality: ,
  conversation_flow: ,
  tone_and_pacing: ,
  dos_and_donts: ,
  objection_handling: ,
  call_control: ,
  learning_rules: ,
};

const categoryColors: Record = {
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
  const [expandedCategories, setExpandedCategories] = useState>(new Set(['compliance']));
  const [editingSections, setEditingSections] = useState>(new Map());
  const [changeDescription, setChangeDescription] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [compareVersions, setCompareVersions] = useState(null);

  // Only allow admins/campaign_managers
  if (!user || (user.role !== 'admin' && user.role !== 'campaign_manager')) {
    return ;
  }

  // ==================== QUERIES ====================

  const { data: knowledge, isLoading: isLoadingKnowledge } = useQuery({
    queryKey: ['/api/knowledge-hub'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub');
      return res.json();
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['/api/knowledge-hub/categories'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/categories');
      return res.json();
    },
  });

  const { data: versionHistory } = useQuery({
    queryKey: ['/api/knowledge-hub/versions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/versions');
      return res.json();
    },
  });

  const { data: promptPreview, isLoading: isLoadingPreview, refetch: refetchPreview } = useQuery({
    queryKey: ['/api/knowledge-hub/prompt-preview'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/knowledge-hub/prompt-preview');
      return res.json();
    },
    enabled: showPromptPreview,
  });

  // Diff comparison query
  const { data: diffResult, isLoading: isLoadingDiff } = useQuery({
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

  const updateEditingSection = (sectionId: string, updates: Partial) => {
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
    if (editingSections.size  {
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
      
        
          
            
              
            
          
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          
            
              
                
                Unified Knowledge Hub
              
              
                Single source of truth for all AI agent knowledge. All agents consume knowledge from this centralized hub only.
              
            
            
              {knowledge && (
                
                  Version {knowledge.version}
                
              )}
              {hasChanges && (
                
                  Unsaved Changes
                
              )}
            
          
        
        
          
            
            
              
                Architectural Requirement
              
              
                All AI agents—voice, email, compliance, or otherwise—must consume knowledge from this unified source only.
                No other routes, documents, or hidden configurations are permitted.
              
            
          
        
      

      {/* Main Tabs */}
      
        
          
            
            Knowledge Sections
          
          
            
            Prompt Preview
          
          
            
            Version History
          
          
            
            Simulate
          
        

        {/* Knowledge Sections Tab */}
        
          {knowledge?.categoryOrder.map(categoryId => {
            const categorySections = knowledge.sectionsByCategory[categoryId] || [];
            const categoryInfo = categories?.categories.find(c => c.id === categoryId);
            const isExpanded = expandedCategories.has(categoryId);

            return (
              
                 toggleCategory(categoryId)}>
                  
                    
                      
                        
                          {isExpanded ? (
                            
                          ) : (
                            
                          )}
                          {categoryIcons[categoryId]}
                          
                            {categoryInfo?.name || categoryId}
                            
                              {categoryInfo?.description}
                            
                          
                        
                        
                          
                            {categorySections.filter(s => s.isActive).length}/{categorySections.length} active
                          
                          Priority: {categoryInfo?.priority || 0}
                        
                      
                    
                  

                  
                    
                      {categorySections.map(section => {
                        const isEditing = editingSections.has(section.id);
                        const editedSection = editingSections.get(section.id) || section;

                        return (
                          
                            
                              
                                {section.title}
                                {!section.isActive && (
                                  Disabled
                                )}
                                {isEditing && (
                                  Editing
                                )}
                              
                              
                                 toggleSectionActive(section.id)}
                                />
                                {isEditing ? (
                                  <>
                                     cancelEditing(section.id)}
                                    >
                                      Cancel
                                    
                                  
                                ) : (
                                   startEditing(section)}
                                  >
                                    Edit
                                  
                                )}
                              
                            

                            {isEditing ? (
                              
                                  updateEditingSection(section.id, { content: e.target.value })
                                }
                                className="min-h-[300px] font-mono text-sm"
                              />
                            ) : (
                              
                                {section.content.substring(0, 500)}
                                {section.content.length > 500 && '...'}
                              
                            )}

                            {section.tags.length > 0 && (
                              
                                {section.tags.map(tag => (
                                  
                                    {tag}
                                  
                                ))}
                              
                            )}
                          
                        );
                      })}
                    
                  
                
              
            );
          })}

          {/* Save Changes Panel */}
          {hasChanges && (
            
              
                
                  
                    Change Description (Required)
                     setChangeDescription(e.target.value)}
                      placeholder="Describe what changed..."
                    />
                  
                  
                    
                      {editingSections.size} section(s) modified
                    
                    
                       {
                          setEditingSections(new Map());
                          setHasChanges(false);
                          setChangeDescription('');
                        }}
                      >
                        Discard All
                      
                      
                        {updateMutation.isPending ? (
                          <>
                            
                            Saving...
                          
                        ) : (
                          <>
                            
                            Save Changes (v{(knowledge?.version || 0) + 1})
                          
                        )}
                      
                    
                  
                
              
            
          )}

          {/* Reset Button */}
          
            
              
                
                  
                  Reset to System Defaults
                
              
              
                
                  Reset to System Defaults?
                  
                    This will replace all knowledge sections with the original system defaults.
                    A new version will be created for tracking. This action cannot be undone.
                  
                
                
                  Cancel
                   resetMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Reset to Defaults
                  
                
              
            
          
        

        {/* Prompt Preview Tab */}
        
          
            
              
                
                  Runtime Prompt Preview
                  
                    View the exact prompt that agents receive at runtime
                  
                
                 {
                  setShowPromptPreview(true);
                  refetchPreview();
                }}>
                  
                  Refresh Preview
                
              
            
            
              {isLoadingPreview ? (
                
                  
                
              ) : promptPreview ? (
                
                  
                    
                      
                        {promptPreview.knowledgeVersion}
                        Knowledge Version
                      
                    
                    
                      
                        {promptPreview.sectionsIncluded}
                        Sections Included
                      
                    
                    
                      
                        {promptPreview.promptLength.toLocaleString()}
                        Characters
                      
                    
                    
                      
                        ~{promptPreview.estimatedTokens.toLocaleString()}
                        Est. Tokens
                      
                    
                  
                  
                    Compiled Prompt
                    
                      
                        {promptPreview.compiledPrompt}
                      
                    
                  
                
              ) : (
                
                  
                  Click "Refresh Preview" to generate the runtime prompt
                
              )}
            
          
        

        {/* Version History Tab */}
        
          
            
              
                
                  Version History
                  
                    Track changes and compare versions with visual diffs
                  
                
                {compareVersions && (
                   setCompareVersions(null)}>
                    Back to History
                  
                )}
              
            
            
              {/* Show Diff Viewer when comparing */}
              {compareVersions ? (
                isLoadingDiff ? (
                  
                    
                    Loading comparison...
                  
                ) : diffResult ? (
                   setCompareVersions(null)}
                  />
                ) : (
                  
                    Unable to load comparison data
                     setCompareVersions(null)}>
                      Back to History
                    
                  
                )
              ) : (
                /* Version List */
                versionHistory?.versions && versionHistory.versions.length > 0 ? (
                  
                    {versionHistory.versions.map((version, index) => (
                      
                        
                          
                            v{version.version}
                          
                          
                            
                              {version.changeDescription || 'No description'}
                            
                            
                              {new Date(version.updatedAt).toLocaleString()}
                            
                          
                        
                        {index === 0 && (
                          Current
                        )}
                        {index > 0 && (
                           setCompareVersions({ a: version.version, b: versionHistory.versions[0].version })}
                          >
                            
                            Compare with Current
                          
                        )}
                      
                    ))}
                  
                ) : (
                  
                    
                    No version history yet
                  
                )
              )}
            
          
        

        {/* Simulate Tab */}
        
          
        
      
    
  );
}

// ==================== SIMULATION PANEL COMPONENT ====================

function SimulationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [campaignId, setCampaignId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [contactId, setContactId] = useState('');
  const [simulationType, setSimulationType] = useState('voice');
  const [simulationResult, setSimulationResult] = useState(null);

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
    
      
        
          Agent Simulation & Preview
          
            Select context and run simulations to preview exact runtime prompts
          
        
        
          
            
              Campaign (Optional)
              
                
                  
                
                
                  None
                  {campaigns?.campaigns?.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
            
              Account (Optional)
              
                
                  
                
                
                  None
                  {accounts?.accounts?.map((a: any) => (
                    {a.name}
                  ))}
                
              
            
            
              Simulation Type
               setSimulationType(v)}>
                
                  
                
                
                  Voice Call
                  Email
                  Text Message
                
              
            
          

          
            {simulateMutation.isPending ? (
              <>
                
                Running...
              
            ) : (
              <>
                
                Run Simulation
              
            )}
          
        
      

      {simulationResult && (
        
          
            Simulation Result
            
              Knowledge Version: {simulationResult.prompt?.knowledgeVersion} |
              Prompt Length: {simulationResult.prompt?.promptLength.toLocaleString()} chars |
              Est. Tokens: ~{simulationResult.prompt?.estimatedTokens.toLocaleString()}
            
          
          
            
              
                {simulationResult.context?.campaign && (
                  Campaign: {simulationResult.context.campaign.name}
                )}
                {simulationResult.context?.account && (
                  Account: {simulationResult.context.account.name}
                )}
                {simulationResult.context?.contact && (
                  Contact: {simulationResult.context.contact.name}
                )}
                {simulationResult.context?.agent && (
                  Agent: {simulationResult.context.agent.name}
                )}
              

              
                Runtime Prompt (Full)
                
                  
                    {simulationResult.prompt?.runtimePrompt}
                  
                
              
            
          
        
      )}
    
  );
}