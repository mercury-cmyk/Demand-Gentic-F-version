import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Lock,
  FileText,
  BarChart3,
  Zap,
  Globe,
  Bot,
  FolderOpen,
  Eye,
  Search,
  Bell,
  User,
  Plus,
  Send,
  Loader2,
  Code2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Rocket,
  Activity,
  Server,
  RefreshCw,
  Download,
  Play,
  Square,
  Box,
  Monitor,
  Mic,
  MicOff,
  Sparkles,
  GitBranch,
  ArrowRight,
  X,
  Upload,
  Brain,
  Wand2,
  CircleDot,
} from 'lucide-react';
import CostsTab from '@/components/ops/costs-tab';
import DeploymentsTab from '@/components/ops/deployments-tab';
import DomainsTab from '@/components/ops/domains-tab';
import AgentsTab from '@/components/ops/agents-tab';
import FileManagerTab, {
  OpsWorkspaceFileContext,
  WorkspaceDirectoryResponse,
  WorkspaceFileResponse,
} from '@/components/ops/file-manager-tab';
import PreviewTab from '@/components/ops/preview-tab';
import WorkstationsTab from '@/components/ops/workstations-tab';
import IamSecrets from '@/pages/iam/iam-secrets';
const CloudLogsMonitor = React.lazy(() => import('@/pages/cloud-logs-monitor'));
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';

/* ── Interfaces ── */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  transport?: string;
  applied?: boolean;
  isError?: boolean;
  retryPrompt?: string;
}

interface OpsOverview {
  deploymentTarget: 'local' | 'vm';
  mode: 'local' | 'ops-agent';
  previewBaseUrl: string;
  workspaceRoot: string;
  currentBranch: string | null;
  currentCommit: string | null;
  canEditWorkspace: boolean;
  canManageDeployments: boolean;
  composeFilePath: string;
  opsAgentReachable: boolean;
}

export type DeployTarget = 'vm' | 'cloud-run';

export interface ProjectService {
  name: string;
  label: string;
  dockerComposeService?: string;
  cloudRunService?: string;
  imageUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'stopped' | 'deploying';
  environment: 'production' | 'development' | 'staging';
  icon: string;
  deployTarget: DeployTarget;
  services: ProjectService[];
}

interface NavSection {
  label: string;
  items: { id: string; label: string; icon: React.ReactNode; badge?: string }[];
}

type CodingAgentProvider = 'agentx' | 'ensemble' | 'codex' | 'claude' | 'gemini' | 'kimi' | 'deepseek';
type CodingAgentRunMode = 'agent' | 'plan';
type CodingAgentModelSelector = 'simple-edit' | 'multi-edit';

/* ── Architect planning step ── */
interface ArchitectStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

const INITIAL_ARCHITECT_STEPS: ArchitectStep[] = [
  { id: 'analyze', label: 'Analyzing code & context', status: 'pending' },
  { id: 'optimize', label: 'Optimizing prompt', status: 'pending' },
  { id: 'plan', label: 'Planning changes', status: 'pending' },
  { id: 'apply', label: 'Applying edits', status: 'pending' },
];

const PROVIDER_ROUTING: Record = {
  kimi: { label: 'Kimi (Primary)', color: 'bg-emerald-500', desc: 'Architecture & code generation' },
  claude: { label: 'Claude', color: 'bg-orange-500', desc: 'Reasoning & validation' },
  gemini: { label: 'Gemini', color: 'bg-blue-500', desc: 'UX & performance' },
  deepseek: { label: 'DeepSeek', color: 'bg-rose-500', desc: 'Security & cost' },
  codex: { label: 'Codex', color: 'bg-violet-500', desc: 'Final synthesis' },
  agentx: { label: 'AgentC', color: 'bg-slate-900', desc: 'Orchestrator' },
  ensemble: { label: 'Ensemble', color: 'bg-indigo-600', desc: 'Multi-agent pipeline' },
};

/* ── Projects configuration ── */
const PROJECTS: Project[] = [
  {
    id: 'demandgentic',
    name: 'DemandGentic AI',
    description: 'Main platform — API, voice engine, campaigns',
    status: 'running',
    environment: 'production',
    icon: '🚀',
    deployTarget: 'vm',
    services: [
      { name: 'api', label: 'API Server', dockerComposeService: 'api' },
      { name: 'nginx', label: 'Nginx Proxy', dockerComposeService: 'nginx' },
      { name: 'ops-agent', label: 'Ops Agent', dockerComposeService: 'ops-agent' },
      { name: 'certbot', label: 'Certbot SSL', dockerComposeService: 'certbot' },
    ],
  },
  {
    id: 'media-bridge',
    name: 'Media Bridge',
    description: 'RTP ↔ Gemini Live audio bridge',
    status: 'running',
    environment: 'production',
    icon: '🎙️',
    deployTarget: 'vm',
    services: [
      { name: 'media-bridge', label: 'Media Bridge', dockerComposeService: 'media-bridge' },
    ],
  },
  {
    id: 'drachtio',
    name: 'Drachtio SIP',
    description: 'SIP signaling server',
    status: 'running',
    environment: 'production',
    icon: '📞',
    deployTarget: 'vm',
    services: [
      { name: 'drachtio', label: 'Drachtio Server', dockerComposeService: 'drachtio' },
    ],
  },
  {
    id: 'cloud-services',
    name: 'Cloud Run Services',
    description: 'GCP Cloud Run managed services',
    status: 'running',
    environment: 'production',
    icon: '☁️',
    deployTarget: 'cloud-run',
    services: [
      { name: 'demandgentic-api', label: 'API (Cloud Run)', cloudRunService: 'demandgentic-api', imageUrl: 'gcr.io/demandgentic/demandgentic-api:latest' },
    ],
  },
];

const SERVICE_MAP: Record = {
  demandgentic: 'api',
  'media-bridge': 'media-bridge',
  drachtio: 'drachtio',
  'cloud-services': 'demandgentic-api',
};

/* ── Navigation ── */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'WORKSPACE',
    items: [
      { id: 'files', label: 'File Manager', icon:  },
      { id: 'preview', label: 'Live Preview', icon:  },
    ],
  },
  {
    label: 'DEVOPS',
    items: [
      { id: 'workstations', label: 'Workstations', icon:  },
      { id: 'deployments', label: 'Deployments', icon:  },
      { id: 'domains', label: 'Domains & DNS', icon:  },
      { id: 'secrets', label: 'Secrets & Env', icon:  },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'logs', label: 'Container Logs', icon:  },
      { id: 'vm-logs', label: 'VM Live Logs', icon:  },
      { id: 'costs', label: 'Cost Analytics', icon:  },
      { id: 'agents', label: 'AI Agents', icon:  },
    ],
  },
];

const TOP_TABS = [
  { id: 'workspace', label: 'Workspace', icon:  },
  { id: 'devops', label: 'DevOps', icon:  },
  { id: 'insights', label: 'Insights', icon:  },
];

const TAB_TO_SECTION: Record = {
  workspace: 'WORKSPACE',
  devops: 'DEVOPS',
  insights: 'INSIGHTS',
};

const SECONDARY_NAV_ORDER = ['DEVOPS', 'WORKSPACE', 'INSIGHTS'];

const AGENT_PROVIDER_LABELS: Record = {
  agentx: 'AgentC',
  ensemble: 'AgentC Ensemble',
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
};

function normalizeOpsRole(role: unknown): string | null {
  if (typeof role === 'string') {
    const trimmed = role.trim().toLowerCase();
    return trimmed || null;
  }

  if (role && typeof role === 'object' && 'role' in role) {
    return normalizeOpsRole((role as { role?: unknown }).role);
  }

  return null;
}

function collectOpsRoles(roles: unknown): string[] {
  if (roles == null) {
    return [];
  }

  const values = Array.isArray(roles) ? roles : [roles];
  return values
    .map((value) => normalizeOpsRole(value))
    .filter((value): value is string => Boolean(value));
}

function parseOpsTokenPayload(token: string | null): Record | null {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length  item.id === pageId)) {
      const tabEntry = Object.entries(TAB_TO_SECTION).find(([, label]) => label === section.label);
      return tabEntry?.[0] || 'workspace';
    }
  }
  return 'workspace';
}

function formatWorkspaceTimestamp(dateStr?: string): string {
  if (!dateStr) return '-';
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return '-';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatWorkspaceBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function FileSearchDrawerPanel({
  selectedFile,
  onSelectFile,
  onOpenInEditor,
}: {
  selectedFile: OpsWorkspaceFileContext | null;
  onSelectFile: (file: OpsWorkspaceFileContext) => void;
  onOpenInEditor: (path?: string) => void;
}) {
  const { toast } = useToast();
  const [directory, setDirectory] = useState({
    currentPath: '',
    breadcrumbs: [],
    entries: [],
  });
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDirectory = useCallback(async (nextPath: string = '') => {
    setLoadingDirectory(true);
    try {
      const params = new URLSearchParams();
      if (nextPath) params.set('path', nextPath);
      const data = await apiJsonRequest('GET', `/api/ops/workspace?${params.toString()}`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load workspace directory');
      }

      setDirectory(data.directory);
    } catch (error) {
      toast({
        title: 'Workspace unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingDirectory(false);
    }
  }, [toast]);

  const openWorkspaceFile = useCallback(async (filePath: string) => {
    setLoadingFile(true);
    try {
      const data = await apiJsonRequest('GET', `/api/ops/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to open file');
      }

      onSelectFile({
        path: data.file.path,
        content: data.file.content,
        modifiedAt: data.file.modifiedAt,
        dirty: false,
      });
    } catch (error) {
      toast({
        title: 'Could not open file',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  }, [onSelectFile, toast]);

  useEffect(() => {
    void fetchDirectory('');
  }, [fetchDirectory]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return directory.entries;
    }

    const query = searchQuery.trim().toLowerCase();
    return directory.entries.filter((entry) => (
      entry.name.toLowerCase().includes(query)
      || entry.path.toLowerCase().includes(query)
    ));
  }, [directory.entries, searchQuery]);

  const navigateToPath = (nextPath: string) => {
    void fetchDirectory(nextPath);
  };

  const navigateUp = () => {
    const crumbs = directory.breadcrumbs.slice(0, -1);
    void fetchDirectory(crumbs.join('/'));
  };

  return (
    
      
        
          
            Workspace files
            
              Search the live repo and hand a file to the editor or manager without sacrificing terminal space.
            
          
           { void fetchDirectory(directory.currentPath); }}
            className="h-8 rounded-lg"
          >
            
          
        

        
          
            
             setSearchQuery(event.target.value)}
              className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm"
            />
          
          {directory.currentPath && (
            
              Up
            
          )}
        
      

      
        
           navigateToPath('')}
            className="font-medium text-slate-600 transition hover:text-indigo-600"
          >
            /
          
          {directory.breadcrumbs.map((crumb, index) => {
            const nextPath = directory.breadcrumbs.slice(0, index + 1).join('/');
            return (
              
                
                 navigateToPath(nextPath)}
                  className="truncate font-medium text-slate-600 transition hover:text-indigo-600"
                >
                  {crumb}
                
              
            );
          })}
        

        
          
            
              
                Selected file
              
              
                {selectedFile?.path || 'No file selected yet'}
              
            
             onOpenInEditor(selectedFile?.path)}
              disabled={!selectedFile}
              className="h-8 rounded-lg"
            >
              Open editor
            
          

          {selectedFile ? (
            <>
              
                {formatWorkspaceTimestamp(selectedFile.modifiedAt)}
                ·
                {formatWorkspaceBytes(selectedFile.content.length)}
              
              
                {selectedFile.content.slice(0, 320) || 'Empty file'}
              
            
          ) : (
            
              Pick a file to give the Coding Agent extra context, or just ask — the agent already knows which project you're in.
            
          )}
        
      

      
        {loadingDirectory ? (
          Loading workspace…
        ) : filteredEntries.length === 0 ? (
          
            No files matched the current filter.
          
        ) : (
          
            {filteredEntries.map((entry) => {
              const isActive = selectedFile?.path === entry.path;
              return (
                 {
                    if (entry.type === 'directory') {
                      navigateToPath(entry.path);
                      return;
                    }
                    void openWorkspaceFile(entry.path);
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                    isActive
                      ? 'border-indigo-200 bg-indigo-50/70 shadow-sm'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  
                    
                      {entry.type === 'directory' ? (
                        
                      ) : (
                        
                      )}
                    
                    
                      {entry.name}
                      
                        {entry.type === 'directory'
                          ? entry.path || '/'
                          : `${formatWorkspaceBytes(entry.size)} · ${formatWorkspaceTimestamp(entry.modifiedAt)}`}
                      
                    
                    
                  
                
              );
            })}
          
        )}
      

      
        
          {filteredEntries.length} item{filteredEntries.length === 1 ? '' : 's'}
        
        {loadingFile && (
          
            
            Opening…
          
        )}
      
    
  );
}

/* ── Real-time Log Viewer Component ── */
function LogViewer({ service, environment }: { service: string; environment: string }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tail, setTail] = useState('200');
  const [since, setSince] = useState('30m');
  const logsEndRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        tail,
        since,
        ...(searchQuery ? { grep: searchQuery } : {}),
      });
      const data = await apiJsonRequest(
        'GET',
        `/api/ops/logs/${service}?${params}`,
      );
      if (data.success) {
        setLines(data.lines || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [service, tail, since, searchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (autoRefresh && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoRefresh]);

  const getLineColor = (line: string) => {
    if (/error|ERR|FAIL|fatal/i.test(line)) return 'text-red-600';
    if (/warn|WARN/i.test(line)) return 'text-amber-600';
    if (/debug|DEBUG/i.test(line)) return 'text-slate-400';
    return 'text-slate-700';
  };

  const exportLogs = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${service}-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    
      {/* Controls Bar */}
      
        
          
          {service}
          
            {environment}
          
        
        
        
           setSearchQuery(e.target.value)}
            className="w-48 h-8 text-xs bg-slate-50 border-slate-200"
          />
          
            
              
            
            
              5 min
              15 min
              30 min
              1 hour
              6 hours
              24 hours
            
          
          
            
              
            
            
              50 lines
              200 lines
              500 lines
              1000 lines
            
          
           setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs ${autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}
          >
            {autoRefresh ?  : }
            {autoRefresh ? 'Live' : 'Paused'}
          
          
            
          
          
            
          
        
      

      {/* Log Output */}
      
        {loading ? (
          
            
            Loading logs...
          
        ) : lines.length === 0 ? (
          
            
            No logs found for this service
            Try extending the time range or check if the container is running
          
        ) : (
          
            {lines.map((line, i) => (
              
                {String(i + 1).padStart(4, ' ')}
                {line}
              
            ))}
            
          
        )}
      

      {/* Status bar */}
      
        {lines.length} lines
        ·
        Last {since}
        {autoRefresh && (
          <>
            ·
            
              
              Refreshing every 5s
            
          
        )}
      
    
  );
}

/* ── Main Component ── */
export default function OpsHub() {
  const { user, token, getToken } = useAuth();
  const { toast } = useToast();
  const [activePage, setActivePage] = useState('workstations');
  const [activeTopTab, setActiveTopTab] = useState('devops');
  const [platformOnline, setPlatformOnline] = useState(true);
  const [overview, setOverview] = useState(null);
  const [activeProject, setActiveProject] = useState(PROJECTS[0]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [codingAgentMode, setCodingAgentMode] = useState('agent');
  const [modelSelector, setModelSelector] = useState('simple-edit');
  const [chatSending, setChatSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('kimi');
  const [architectSteps, setArchitectSteps] = useState([]);
  const [showArchitect, setShowArchitect] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [promptOptimizing, setPromptOptimizing] = useState(false);
  const [fileContextExpanded, setFileContextExpanded] = useState(false);
  const voiceRecognitionRef = useRef(null);
  const [externalFileUpdate, setExternalFileUpdate] = useState(null);
  const [externalFileToken, setExternalFileToken] = useState(0);
  const [requestedFilePath, setRequestedFilePath] = useState(undefined);
  const [requestedFileToken, setRequestedFileToken] = useState(0);
  const chatEndRef = useRef(null);
  const authToken = token || getToken();
  const tokenPayload = parseOpsTokenPayload(authToken);
  const userRoles = Array.from(new Set([
    ...collectOpsRoles((user as { role?: unknown; roles?: unknown } | null)?.role),
    ...collectOpsRoles((user as { role?: unknown; roles?: unknown } | null)?.roles),
    ...collectOpsRoles(tokenPayload?.role),
    ...collectOpsRoles(tokenPayload?.roles),
  ]));
  const canManageSecrets = userRoles.includes('admin');
  const navSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => canManageSecrets || item.id !== 'secrets'),
      })).filter((section) => section.items.length > 0),
    [canManageSecrets],
  );

  useEffect(() => {
    // Guard: if no auth token, redirect to login immediately
    if (!authToken) {
      window.location.href = '/login';
      return;
    }

    const loadOverview = async () => {
      try {
        const data = await apiJsonRequest(
          'GET',
          '/api/ops/overview',
        );
        if (!data.success) {
          throw new Error(data.error || 'Failed to load Ops Hub overview');
        }
        setOverview(data.overview);
      } catch (error) {
        // Don't toast session-expired — the redirect handles it
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('Session expired')) {
          toast({
            title: 'Ops Hub overview unavailable',
            description: msg,
            variant: 'destructive',
          });
        }
      }
    };

    const checkPlatform = async () => {
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
        setPlatformOnline(response.ok);
      } catch {
        setPlatformOnline(false);
      }
    };

    loadOverview();
    checkPlatform();
    const interval = setInterval(checkPlatform, 30000);
    return () => clearInterval(interval);
  }, [toast, authToken]);

  useEffect(() => {
    if (!canManageSecrets && activePage === 'secrets') {
      setActivePage('files');
      setActiveTopTab(getTopTabForPage('files'));
    }
  }, [activePage, canManageSecrets]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const goToPage = (pageId: string) => {
    setActivePage(pageId);
    setActiveTopTab(getTopTabForPage(pageId));
  };

  const goToTab = (tabId: string) => {
    setActiveTopTab(tabId);
    const sectionLabel = TAB_TO_SECTION[tabId];
    const section = navSections.find((entry) => entry.label === sectionLabel);
    if (section?.items.length) {
      setActivePage(section.items[0].id);
    }
  };

  const toggleSidePanel = () => {
    setSidePanelOpen((v) => !v);
  };

  /* ── Voice input ── */
  const toggleVoiceInput = useCallback(() => {
    if (voiceListening) {
      voiceRecognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Voice input unavailable', description: 'Your browser does not support Speech Recognition.', variant: 'destructive' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i  {
      setVoiceListening(false);
    };
    recognition.onend = () => {
      setVoiceListening(false);
    };

    voiceRecognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
  }, [voiceListening, toast]);

  /* ── Prompt optimization ── */
  const optimizePrompt = useCallback(async (rawPrompt: string): Promise => {
    setPromptOptimizing(true);
    try {
      const data = await apiJsonRequest('POST', '/api/ops/coding-agent', {
        prompt: `Rewrite the following coding prompt to be more precise, technical, and actionable for a coding agent. Return ONLY the improved prompt text, nothing else.\n\nOriginal prompt: ${rawPrompt}`,
        mode: 'general',
        preferredProvider: 'kimi',
      }, { timeout: 60000 });
      if (data.success && data.optimizedPrompt) {
        return data.optimizedPrompt;
      }
      return rawPrompt;
    } catch {
      return rawPrompt;
    } finally {
      setPromptOptimizing(false);
    }
  }, []);

  /* ── Architect step progression ── */
  const advanceArchitectStep = useCallback((stepId: string, status: ArchitectStep['status'], detail?: string) => {
    setArchitectSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status, detail } : s)),
    );
  }, []);

  const handleChatSend = async (overridePrompt?: string) => {
    const rawPrompt = overridePrompt || chatInput.trim();
    if (!rawPrompt) return;
    const requestMode = codingAgentMode === 'plan' ? 'plan' : modelSelector;

    // Stop voice if active
    if (voiceListening) {
      voiceRecognitionRef.current?.stop();
      setVoiceListening(false);
    }

    const userMessage: ChatMessage = { role: 'user', content: rawPrompt, timestamp: new Date() };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatSending(true);

    // Show architect steps
    setShowArchitect(true);
    setArchitectSteps(INITIAL_ARCHITECT_STEPS.map((s) => ({ ...s, status: 'pending' as const })));

    try {
      // Step 1: Analyze
      advanceArchitectStep('analyze', 'active', `Scoping to ${activeProject.name}...`);
      await new Promise((r) => setTimeout(r, 300));
      advanceArchitectStep('analyze', 'done', selectedFile ? `Analyzed ${selectedFile.path} in ${activeProject.name}` : `Context ready — ${activeProject.name}`);

      // Step 2: Optimize prompt
      advanceArchitectStep('optimize', 'active', 'Improving prompt quality...');
      let prompt = rawPrompt;
      if (codingAgentMode === 'agent' && rawPrompt.length > 20) {
        prompt = await optimizePrompt(rawPrompt);
      }
      advanceArchitectStep('optimize', 'done', prompt !== rawPrompt ? 'Prompt optimized' : 'Prompt ready');

      // Step 3: Plan
      advanceArchitectStep('plan', 'active', `Routing to ${PROVIDER_ROUTING[selectedProvider]?.label || selectedProvider}...`);

      const isMultiEdit = codingAgentMode === 'agent' && modelSelector === 'multi-edit';
      const data = await apiJsonRequest(
        'POST',
        '/api/ops/coding-agent',
        {
          prompt,
          mode: isMultiEdit ? 'multi-edit' : requestMode,
          selectedFilePath: selectedFile?.path,
          selectedFileContent: selectedFile?.dirty ? selectedFile.content : undefined,
          applyChanges: codingAgentMode === 'agent',
          preferredProvider: selectedProvider === 'agentx' ? undefined : selectedProvider,
          projectContext: {
            id: activeProject.id,
            name: activeProject.name,
            description: activeProject.description,
            environment: activeProject.environment,
            deployTarget: activeProject.deployTarget,
            services: activeProject.services.map((s) => ({ name: s.name, label: s.label })),
          },
        },
        { timeout: 180000 },
      );

      advanceArchitectStep('plan', 'done', 'Changes planned');

      if (!data.success) {
        advanceArchitectStep('apply', 'error', data.error || 'Failed');
        throw new Error(data.error || 'Failed to run coding agent');
      }

      // Step 4: Apply
      advanceArchitectStep('apply', 'active', 'Delivering result...');

      const fileEdits = data.response?.fileEdits as Array | undefined;
      const editSummary = fileEdits?.length
        ? `\n\nFiles ${data.response?.applied ? 'applied' : 'proposed'}: ${fileEdits.map((f: any) => `${f.isNew ? '(new) ' : ''}${f.path}`).join(', ')}`
        : '';

      const nextMessage: ChatMessage = {
        role: 'assistant',
        content: (data.response?.summary || 'No response generated.') + editSummary,
        timestamp: new Date(),
        provider: data.response?.provider === 'system' ? undefined : data.response?.provider,
        model: data.response?.model,
        transport: data.response?.transport,
        applied: Boolean(data.response?.applied),
      };
      setChatMessages((current) => [...current, nextMessage]);

      advanceArchitectStep('apply', 'done', data.response?.applied ? 'Edits applied' : 'Response ready');

      // Handle single-file edit applied
      if (data.response?.applied && data.response?.path && typeof data.response?.updatedContent === 'string') {
        const nextToken = externalFileToken + 1;
        setExternalFileToken(nextToken);
        setExternalFileUpdate({
          path: data.response.path,
          content: data.response.updatedContent,
          modifiedAt: data.response.modifiedAt,
          token: nextToken,
        });
        setSelectedFile({
          path: data.response.path,
          content: data.response.updatedContent,
          modifiedAt: data.response.modifiedAt,
          dirty: false,
        });
        toast({ title: 'Edit applied', description: data.response.path });
      }

      // Handle multi-file edits applied
      if (data.response?.applied && fileEdits?.length) {
        for (const edit of fileEdits) {
          const nextToken = externalFileToken + 1;
          setExternalFileToken(nextToken);
          setExternalFileUpdate({
            path: edit.path,
            content: edit.content,
            token: nextToken,
          });
        }
        toast({ title: 'Multi-file edit applied', description: `${fileEdits.length} files updated` });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errMsg.includes('timed out') || errMsg.includes('AbortError');
      advanceArchitectStep('apply', 'error', isTimeout ? 'Request timed out' : errMsg);
      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: isTimeout
            ? 'The AI service took too long to respond. This can happen with complex prompts or when the service is under heavy load. Click **Retry** to try again.'
            : `Error: ${errMsg}`,
          timestamp: new Date(),
          isError: true,
          retryPrompt: rawPrompt,
        },
      ]);
    } finally {
      setChatSending(false);
      // Collapse architect after brief delay
      setTimeout(() => setShowArchitect(false), 3000);
    }
  };

  const handleChatKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSend();
    }
  };

  const secondaryNavSections = useMemo(
    () => SECONDARY_NAV_ORDER.map((label) => navSections.find((entry) => entry.label === label)).filter((section): section is NavSection => Boolean(section)),
    [navSections],
  );

  const handleDrawerFileSelect = useCallback((file: OpsWorkspaceFileContext) => {
    setSelectedFile(file);
  }, []);

  const handleOpenFileManager = useCallback((path?: string) => {
    if (path) {
      setRequestedFilePath(path);
      setRequestedFileToken((current) => current + 1);
    }
    goToPage('files');
  }, []);

  const renderContent = () => {
    switch (activePage) {
      case 'secrets':
        return canManageSecrets ?  : null;
      case 'logs':
        return (
          
        );
      case 'vm-logs':
        return (
          }>
            
          
        );
      case 'costs':
        return ;
      case 'workstations':
        return ;
      case 'deployments':
        return ;
      case 'domains':
        return ;
      case 'agents':
        return ;
      case 'files':
        return (
          
        );
      case 'preview':
        return ;
      default:
        return (
          
            
            Select a section to get started
          
        );
    }
  };

  const statusColor = activeProject.status === 'running'
    ? 'bg-emerald-400'
    : activeProject.status === 'deploying'
    ? 'bg-amber-400 animate-pulse'
    : 'bg-slate-300';

  return (
    
      {/* ── Header ── */}
      
        {/* Logo */}
        
          
            
          
          Ops Hub
        

        {/* Separator */}
        

        {/* Project Switcher */}
        
           setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-50 transition-colors text-sm"
          >
            
            {activeProject.name}
            {activeProject.environment}
            
          

          {projectDropdownOpen && (
            <>
               setProjectDropdownOpen(false)} />
              
                
                  Projects
                
                {PROJECTS.map((project) => (
                   {
                      setActiveProject(project);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                      activeProject.id === project.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    
                    
                      {project.name}
                      {project.description}
                    
                    
                      {project.deployTarget === 'cloud-run' ? 'Cloud Run' : 'VM'}
                    
                  
                ))}
              
            
          )}
        

        {/* Top Tabs */}
        
          {TOP_TABS.map((tab) => (
             goToTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors ${
                activeTopTab === tab.id
                  ? 'text-slate-900 bg-slate-100'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              {tab.label}
            
          ))}
        

        {/* Right side */}
        
          
            
            Agent C
          
          
          
            
          
        
      

      {/* ── Secondary Navigation ── */}
      
        
          {secondaryNavSections.map((section) =>
            section.items.map((item) => (
               goToPage(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                  activePage === item.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {item.icon}
                {item.label}
              
            ))
          )}
        
      

      {/* ── Body ── */}
      
        
          {activePage === 'logs' || activePage === 'vm-logs' ? (
            renderContent()
          ) : (
            
              {renderContent()}
            
          )}
        

        {sidePanelOpen && (
          
            {/* ── Panel Header ── */}
            
              
                
                  
                    
                  
                  
                    Agent C
                    {activeProject.name}
                  
                
                 setSidePanelOpen(false)}
                  className="h-7 w-7 rounded-md p-0 text-slate-400 hover:bg-slate-100"
                >
                  
                
              

              {/* Mode & Provider Controls */}
              
                
                   setCodingAgentMode('agent')}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      codingAgentMode === 'agent'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Agent
                  
                   setCodingAgentMode('plan')}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      codingAgentMode === 'plan'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Plan
                  
                

                {codingAgentMode === 'agent' && (
                   setModelSelector(value as CodingAgentModelSelector)}
                  >
                    
                      
                    
                    
                      Patch
                      Multi-File
                    
                  
                )}

                 setSelectedProvider(value as CodingAgentProvider)}
                >
                  
                    
                  
                  
                    {Object.entries(PROVIDER_ROUTING).map(([key, info]) => (
                      
                        
                          
                          {info.label}
                        
                      
                    ))}
                  
                
              
            

            {/* ── Collapsible File Context ── */}
            {selectedFile && (
              
                 setFileContextExpanded(!fileContextExpanded)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition hover:bg-slate-50"
                >
                  
                  {selectedFile.path}
                  active
                  
                
                {fileContextExpanded && (
                  
                    
                      {formatWorkspaceTimestamp(selectedFile.modifiedAt)}
                      ·
                      {formatWorkspaceBytes(selectedFile.content.length)}
                       setSelectedFile(null)}
                        className="ml-auto text-[10px] text-red-400 hover:text-red-600"
                      >
                        Clear
                      
                    
                    
                      {selectedFile.content.slice(0, 400) || 'Empty file'}
                    
                  
                )}
              
            )}

            {/* ── Architect Pipeline View ── */}
            {showArchitect && architectSteps.length > 0 && (
              
                
                  
                  Pipeline
                
                
                  {architectSteps.map((step, i) => (
                    
                      {step.status === 'pending' && }
                      {step.status === 'active' && }
                      {step.status === 'done' && }
                      {step.status === 'error' && }
                      
                        
                          {step.label}
                        
                        {step.detail && (
                          {step.detail}
                        )}
                      
                      {i 
                      )}
                    
                  ))}
                
              
            )}

            {/* ── Chat Messages ── */}
            
              {chatMessages.length === 0 ? (
                
                  
                    
                  
                  What would you like to build?
                  
                    Agent C is scoped to {activeProject.name}. Select a file in the workspace, then ask for edits, analysis, or planning.
                  

                  
                    {[
                      { label: 'Analyze code', prompt: `Analyze the key files in the ${activeProject.name} project for issues and improvements.` },
                      { label: 'Fix a bug', prompt: selectedFile ? 'Fix a bug in the currently selected file.' : `Help me debug an issue in the ${activeProject.name} project.` },
                      { label: 'Refactor', prompt: selectedFile ? 'Refactor the selected file for clarity and maintainability.' : `Suggest refactoring targets in ${activeProject.name}.` },
                      { label: 'Plan feature', prompt: `Plan a new feature for the ${activeProject.name} project and explain the implementation steps.` },
                    ].map((action) => (
                       setChatInput(action.prompt)}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 text-left"
                      >
                        {action.label}
                      
                    ))}
                  

                   goToPage('files')}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400 transition hover:text-slate-600"
                  >
                    
                    Open workspace
                  
                
              ) : (
                chatMessages.map((message, index) => {
                  const providerLabel =
                    message.provider && message.provider in AGENT_PROVIDER_LABELS
                      ? AGENT_PROVIDER_LABELS[message.provider as CodingAgentProvider]
                      : message.provider;

                  return (
                    
                      
                        {message.content}
                        
                          {providerLabel && via {providerLabel}}
                          {message.model && {message.model}}
                          {message.transport && {message.transport}}
                          {message.applied && (
                            
                              
                              edit applied
                            
                          )}
                        
                        {message.isError && message.retryPrompt && (
                           handleChatSend(message.retryPrompt!)}
                            disabled={chatSending}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            
                            Retry
                          
                        )}
                      
                    
                  );
                })
              )}
              
            

            {/* ── Input Area ── */}
            
              {promptOptimizing && (
                
                  
                  Optimizing prompt...
                
              )}
              
                 setChatInput(event.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={voiceListening ? 'Listening...' : 'Describe what you need...'}
                  className={`min-h-[64px] max-h-[120px] resize-none rounded-lg border-slate-200 bg-slate-50 pr-20 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:ring-0 ${
                    voiceListening ? 'border-red-300 bg-red-50/30' : ''
                  }`}
                  rows={2}
                />
                
                  
                    {voiceListening ?  : }
                  
                   handleChatSend()}
                    disabled={chatSending || !chatInput.trim()}
                    className="rounded-md bg-slate-900 p-1.5 transition-colors hover:bg-slate-800 disabled:opacity-30"
                  >
                    {chatSending ? (
                      
                    ) : (
                      
                    )}
                  
                
              
              
                Enter to send
                
                  
                  {PROVIDER_ROUTING[selectedProvider]?.label || selectedProvider}
                
              
            
          
        )}
      

      {/* ── Footer ── */}
      
        
          
          {platformOnline ? 'Online' : 'Offline'}
        
        {overview?.currentBranch && (
          
            {overview.currentBranch}{overview.currentCommit ? ` · ${overview.currentCommit.slice(0, 7)}` : ''}
          
        )}
        {activeProject.deployTarget === 'vm' ? 'VM' : 'Cloud Run'} · {activeProject.environment}
      
    
  );
}