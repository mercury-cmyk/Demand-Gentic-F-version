import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  FileCode2,
  CheckCircle2,
  ChevronDown,
  Terminal,
  Rocket,
  Settings,
  Activity,
  Server,
  RefreshCw,
  Filter,
  Download,
  Play,
  Square,
  Box,
  Monitor,
} from 'lucide-react';
import CostsTab from '@/components/ops/costs-tab';
import DeploymentsTab from '@/components/ops/deployments-tab';
import DomainsTab from '@/components/ops/domains-tab';
import AgentsTab from '@/components/ops/agents-tab';
import FileManagerTab, { OpsWorkspaceFileContext } from '@/components/ops/file-manager-tab';
import PreviewTab from '@/components/ops/preview-tab';
import WorkstationsTab from '@/components/ops/workstations-tab';
import IamSecrets from '@/pages/iam/iam-secrets';
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

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'stopped' | 'deploying';
  environment: 'production' | 'development' | 'staging';
  icon: string;
}

interface NavSection {
  label: string;
  items: { id: string; label: string; icon: React.ReactNode; badge?: string }[];
}

type CodingAgentProvider = 'codex' | 'claude' | 'gemini';
type CodingAgentProviderMode = 'auto' | 'manual';
type CodingAgentOptimizationProfile = 'quality' | 'balanced' | 'cost';

/* ── Projects configuration ── */
const PROJECTS: Project[] = [
  {
    id: 'demandgentic',
    name: 'DemandGentic AI',
    description: 'Main platform — API, voice engine, campaigns',
    status: 'running',
    environment: 'production',
    icon: '🚀',
  },
  {
    id: 'media-bridge',
    name: 'Media Bridge',
    description: 'RTP ↔ Gemini Live audio bridge',
    status: 'running',
    environment: 'production',
    icon: '🎙️',
  },
  {
    id: 'drachtio',
    name: 'Drachtio SIP',
    description: 'SIP signaling server',
    status: 'running',
    environment: 'production',
    icon: '📞',
  },
];

const SERVICE_MAP: Record<string, string> = {
  demandgentic: 'api',
  'media-bridge': 'media-bridge',
  drachtio: 'drachtio',
};

/* ── Navigation ── */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'WORKSPACE',
    items: [
      { id: 'files', label: 'File Manager', icon: <FolderOpen className="w-4 h-4" /> },
      { id: 'preview', label: 'Live Preview', icon: <Eye className="w-4 h-4" /> },
    ],
  },
  {
    label: 'DEVOPS',
    items: [
      { id: 'workstations', label: 'Workstations', icon: <Monitor className="w-4 h-4" /> },
      { id: 'deployments', label: 'Deployments', icon: <Rocket className="w-4 h-4" /> },
      { id: 'domains', label: 'Domains & DNS', icon: <Globe className="w-4 h-4" /> },
      { id: 'secrets', label: 'Secrets & Env', icon: <Lock className="w-4 h-4" /> },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'logs', label: 'Container Logs', icon: <Terminal className="w-4 h-4" /> },
      { id: 'costs', label: 'Cost Analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'agents', label: 'AI Agents', icon: <Bot className="w-4 h-4" /> },
    ],
  },
];

const TOP_TABS = [
  { id: 'workspace', label: 'Workspace', icon: <Code2 className="w-4 h-4" /> },
  { id: 'devops', label: 'DevOps', icon: <Server className="w-4 h-4" /> },
  { id: 'insights', label: 'Insights', icon: <Activity className="w-4 h-4" /> },
];

const TAB_TO_SECTION: Record<string, string> = {
  workspace: 'WORKSPACE',
  devops: 'DEVOPS',
  insights: 'INSIGHTS',
};

const AGENT_PROVIDER_LABELS: Record<CodingAgentProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
};

const OPTIMIZATION_PROFILE_LABELS: Record<CodingAgentOptimizationProfile, string> = {
  quality: 'Excellent Code Quality',
  balanced: 'Balanced',
  cost: 'Cost Optimized',
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

function parseOpsTokenPayload(token: string | null): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getTopTabForPage(pageId: string): string {
  for (const section of NAV_SECTIONS) {
    if (section.items.some((item) => item.id === pageId)) {
      const tabEntry = Object.entries(TAB_TO_SECTION).find(([, label]) => label === section.label);
      return tabEntry?.[0] || 'workspace';
    }
  }
  return 'workspace';
}

/* ── Real-time Log Viewer Component ── */
function LogViewer({ service, environment }: { service: string; environment: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tail, setTail] = useState('200');
  const [since, setSince] = useState('30m');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        tail,
        since,
        ...(searchQuery ? { grep: searchQuery } : {}),
      });
      const data = await apiJsonRequest<{ success: boolean; lines?: string[] }>(
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
    <div className="flex flex-col h-full">
      {/* Controls Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
          <Box className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">{service}</span>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
            {environment}
          </Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-8 text-xs bg-slate-50 border-slate-200"
          />
          <Select value={since} onValueChange={setSince}>
            <SelectTrigger className="w-24 h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">5 min</SelectItem>
              <SelectItem value="15m">15 min</SelectItem>
              <SelectItem value="30m">30 min</SelectItem>
              <SelectItem value="1h">1 hour</SelectItem>
              <SelectItem value="6h">6 hours</SelectItem>
              <SelectItem value="24h">24 hours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tail} onValueChange={setTail}>
            <SelectTrigger className="w-24 h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 lines</SelectItem>
              <SelectItem value="200">200 lines</SelectItem>
              <SelectItem value="500">500 lines</SelectItem>
              <SelectItem value="1000">1000 lines</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs ${autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}
          >
            {autoRefresh ? <Play className="w-3 h-3 mr-1" /> : <Square className="w-3 h-3 mr-1" />}
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="h-8 text-xs">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="sm" onClick={exportLogs} className="h-8 text-xs">
            <Download className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Log Output */}
      <div className="flex-1 overflow-y-auto bg-slate-50 font-mono text-xs p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Terminal className="w-8 h-8 mb-2 opacity-40" />
            <p>No logs found for this service</p>
            <p className="text-[10px] mt-1">Try extending the time range or check if the container is running</p>
          </div>
        ) : (
          <div className="space-y-0">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`py-0.5 leading-5 hover:bg-white/80 px-2 -mx-2 rounded ${getLineColor(line)}`}
              >
                <span className="text-slate-300 select-none mr-3">{String(i + 1).padStart(4, ' ')}</span>
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center px-4 py-1.5 border-t border-slate-200 bg-white text-[11px] text-slate-500">
        <span>{lines.length} lines</span>
        <span className="mx-2">·</span>
        <span>Last {since}</span>
        {autoRefresh && (
          <>
            <span className="mx-2">·</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Refreshing every 5s
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function OpsHub() {
  const { user, token, getToken } = useAuth();
  const { toast } = useToast();
  const [activePage, setActivePage] = useState('files');
  const [activeTopTab, setActiveTopTab] = useState('workspace');
  const [platformOnline, setPlatformOnline] = useState(true);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [activeProject, setActiveProject] = useState<Project>(PROJECTS[0]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState<'simple-edit' | 'debug' | 'deploy' | 'general'>('simple-edit');
  const [applyEdits, setApplyEdits] = useState(true);
  const [providerMode, setProviderMode] = useState<CodingAgentProviderMode>('auto');
  const [preferredProvider, setPreferredProvider] = useState<CodingAgentProvider>('codex');
  const [optimizationProfile, setOptimizationProfile] = useState<CodingAgentOptimizationProfile>('balanced');
  const [chatSending, setChatSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<OpsWorkspaceFileContext | null>(null);
  const [externalFileUpdate, setExternalFileUpdate] = useState<{
    path: string;
    content: string;
    modifiedAt?: string;
    token: number;
  } | null>(null);
  const [externalFileToken, setExternalFileToken] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
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
        const data = await apiJsonRequest<{ success: boolean; overview: OpsOverview; error?: string }>(
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
    const section = NAV_SECTIONS.find((entry) => entry.label === sectionLabel);
    if (section?.items.length) {
      setActivePage(section.items[0].id);
    }
  };

  const handleChatSend = async () => {
    const prompt = chatInput.trim();
    if (!prompt) return;

    const userMessage: ChatMessage = { role: 'user', content: prompt, timestamp: new Date() };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatSending(true);

    try {
      const data = await apiJsonRequest<any>(
        'POST',
        '/api/ops/coding-agent',
        {
          prompt,
          mode: chatMode,
          selectedFilePath: selectedFile?.path,
          selectedFileContent: selectedFile?.content,
          applyChanges: chatMode === 'simple-edit' ? applyEdits : false,
          providerMode,
          preferredProvider,
          optimizationProfile,
        },
      );

      if (!data.success) {
        throw new Error(data.error || 'Failed to run coding agent');
      }

      const nextMessage: ChatMessage = {
        role: 'assistant',
        content: data.response?.summary || 'No response generated.',
        timestamp: new Date(),
        provider: data.response?.provider,
        model: data.response?.model,
        transport: data.response?.transport,
        applied: Boolean(data.response?.applied),
      };
      setChatMessages((current) => [...current, nextMessage]);

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
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : String(error)}`, timestamp: new Date() },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  const handleChatKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSend();
    }
  };

  const activeSections = useMemo(
    () => navSections.filter((section) => section.label === TAB_TO_SECTION[activeTopTab]),
    [activeTopTab, navSections],
  );

  const renderContent = () => {
    switch (activePage) {
      case 'secrets':
        return canManageSecrets ? <IamSecrets /> : null;
      case 'logs':
        return (
          <LogViewer
            service={SERVICE_MAP[activeProject.id] || 'api'}
            environment={activeProject.environment}
          />
        );
      case 'costs':
        return <CostsTab />;
      case 'workstations':
        return <WorkstationsTab />;
      case 'deployments':
        return <DeploymentsTab />;
      case 'domains':
        return <DomainsTab />;
      case 'agents':
        return <AgentsTab />;
      case 'files':
        return (
          <FileManagerTab
            onFileContextChange={setSelectedFile}
            externalFileUpdate={externalFileUpdate}
          />
        );
      case 'preview':
        return <PreviewTab />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Code2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a section to get started</p>
          </div>
        );
    }
  };

  const statusColor = activeProject.status === 'running'
    ? 'bg-emerald-400'
    : activeProject.status === 'deploying'
    ? 'bg-amber-400 animate-pulse'
    : 'bg-slate-300';
  const selectionSummary = providerMode === 'manual'
    ? `Manual: ${AGENT_PROVIDER_LABELS[preferredProvider]} first`
    : `Auto: ${OPTIMIZATION_PROFILE_LABELS[optimizationProfile]}`;
  const selectionDetail = providerMode === 'manual'
    ? 'Manual mode uses your chosen provider first and keeps the profile for fallback order.'
    : optimizationProfile === 'quality'
    ? 'Quality mode prioritizes the strongest coding and reasoning providers before cost.'
    : optimizationProfile === 'cost'
    ? 'Cost mode prefers Gemini first, then escalates only when needed.'
    : 'Balanced mode favors Codex first, then falls back for deeper reasoning or lower cost.';

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 overflow-hidden font-sans">
      {/* ── Header ── */}
      <header className="h-[56px] border-b border-slate-200 bg-white flex items-center px-5 shrink-0 z-50 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="text-[15px] font-bold text-slate-900 tracking-tight">
              Operations Hub
            </span>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="relative mr-6">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <span className="text-lg">{activeProject.icon}</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-800">{activeProject.name}</div>
              <div className="text-[10px] text-slate-500">{activeProject.environment}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
          </button>

          {projectDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projects</span>
                </div>
                {PROJECTS.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setActiveProject(project);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                      activeProject.id === project.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className="text-xl">{project.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{project.name}</div>
                      <div className="text-xs text-slate-500 truncate">{project.description}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        project.status === 'running' ? 'bg-emerald-400' : project.status === 'deploying' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'
                      }`} />
                      <span className="text-[10px] text-slate-500 capitalize">{project.status}</span>
                    </div>
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors">
                    <Plus className="w-4 h-4" />
                    Add Project
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top Tabs */}
        <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {TOP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200 ${
                activeTopTab === tab.id
                  ? 'text-slate-900 bg-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1.5">
          <Badge className={`${statusColor.replace('bg-', 'bg-').replace('-400', '-100')} text-xs px-2.5 py-0.5 rounded-full border-0`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor} mr-1.5`} />
            <span className={statusColor.includes('emerald') ? 'text-emerald-700' : statusColor.includes('amber') ? 'text-amber-700' : 'text-slate-600'}>
              {activeProject.status === 'running' ? 'Online' : activeProject.status === 'deploying' ? 'Deploying' : 'Offline'}
            </span>
          </Badge>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all relative">
            <Bell className="w-4 h-4" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center ml-1 shadow-sm cursor-pointer">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-56 border-r border-slate-200 bg-slate-50/80 flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto py-4 px-2">
                      {activeSections.map((section) => (
              <div key={section.label} className="mb-5">
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-bold text-slate-400 tracking-[0.15em] uppercase">
                    {section.label}
                  </span>
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => goToPage(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 mb-0.5 ${
                      activePage === item.id
                        ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm border border-indigo-100'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className={activePage === item.id ? 'text-indigo-500' : 'text-slate-400'}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}

            {/* Quick Access */}
            <div className="border-t border-slate-200 mt-3 pt-4">
              <div className="px-3 mb-2">
                <span className="text-[10px] font-bold text-slate-400/80 tracking-[0.15em] uppercase">
                  Quick Access
                </span>
              </div>
              {NAV_SECTIONS.filter((section) => section.label !== TAB_TO_SECTION[activeTopTab]).map((section) => (
                <div key={section.label} className="mb-0.5">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => goToPage(item.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
                        activePage === item.id
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="border-t border-slate-200 px-3 py-3">
            <button className="w-full flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 rounded-lg px-3 py-2 hover:bg-slate-100 transition-all">
              <Settings className="w-4 h-4" />
              <span className="font-medium">Settings</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          {activePage === 'logs' ? (
            renderContent()
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              {renderContent()}
            </div>
          )}
        </main>

        {/* Right Panel - AI Agent */}
        <aside className="w-[360px] border-l border-slate-200 bg-white flex flex-col shrink-0">
          <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-800">AI Coding Agent</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-700 uppercase tracking-widest font-bold">Ready</span>
            </div>
          </div>

          {/* Chat Settings */}
          <div className="px-4 py-3 border-b border-slate-200 space-y-3">
            <div className="flex gap-2">
              <Select value={chatMode} onValueChange={(value) => setChatMode(value as typeof chatMode)}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700 flex-1 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple-edit">Simple Edit</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="deploy">Deploy</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={providerMode} onValueChange={(value) => setProviderMode(value as CodingAgentProviderMode)}>
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto Select</SelectItem>
                  <SelectItem value="manual">Manual Select</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={optimizationProfile}
                onValueChange={(value) => setOptimizationProfile(value as CodingAgentOptimizationProfile)}
              >
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">Excellent Code Quality</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="cost">Cost Optimized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
              <Select
                value={preferredProvider}
                onValueChange={(value) => setPreferredProvider(value as CodingAgentProvider)}
                disabled={providerMode !== 'manual'}
              >
                <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 text-slate-700 rounded-lg disabled:opacity-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="codex">Codex</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                </SelectContent>
              </Select>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold">Selection</p>
                <p className="mt-1 text-xs font-medium text-slate-700">{selectionSummary}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold">Workspace Target</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-700">
                    <FileCode2 className="w-4 h-4 text-indigo-500" />
                    <span className="truncate">{selectedFile?.path || 'No file selected'}</span>
                  </div>
                </div>
                <Switch
                  checked={applyEdits}
                  onCheckedChange={setApplyEdits}
                  disabled={chatMode !== 'simple-edit'}
                />
              </div>
              <p className="text-xs text-slate-500">
                {chatMode === 'simple-edit'
                  ? applyEdits
                    ? 'Simple Edit will write changes back to the selected file.'
                    : 'Simple Edit is in preview mode and will not save changes.'
                  : 'Non-edit modes use the agent for analysis and guidance.'}
              </p>
              <p className="text-xs text-slate-500">{selectionDetail}</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 bg-slate-50/50">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-slate-200 flex items-center justify-center mb-4">
                  <Bot className="w-7 h-7 text-indigo-400" />
                </div>
                <p className="text-sm text-slate-600 font-medium">AI Coding Agent</p>
                <p className="text-xs text-slate-400 mt-2 max-w-xs">
                  Ask for targeted code changes, debugging, or deployment help. Open a file first for file edits.
                </p>
              </div>
            ) : (
              chatMessages.map((message, index) => {
                const providerLabel =
                  message.provider && message.provider in AGENT_PROVIDER_LABELS
                    ? AGENT_PROVIDER_LABELS[message.provider as CodingAgentProvider]
                    : message.provider;

                return (
                  <div key={`${message.timestamp.toISOString()}-${index}`} className={`mb-4 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                    <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 shadow-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] opacity-60">
                        {providerLabel && <span>via {providerLabel}</span>}
                        {message.model && <span>{message.model}</span>}
                        {message.transport && <span>{message.transport}</span>}
                        {message.applied && (
                          <span className="inline-flex items-center gap-1 text-emerald-500 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            edit applied
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-slate-200 p-3.5 bg-white">
            <div className="relative">
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Describe the change, bug, or deployment task..."
                className="min-h-[84px] max-h-[160px] bg-slate-50 border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 resize-none pr-12 rounded-xl focus:border-indigo-300 focus:ring-indigo-200"
                rows={3}
              />
              <button
                onClick={handleChatSend}
                disabled={chatSending || !chatInput.trim()}
                className="absolute right-2.5 bottom-2.5 p-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-30 transition-all shadow-md"
              >
                {chatSending ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Footer ── */}
      <footer className="h-8 border-t border-slate-200 bg-white flex items-center px-5 shrink-0 text-[11px]">
        <span className="text-slate-400 font-medium">v1.0.5-stable</span>
        <div className="ml-5 flex items-center gap-2 bg-slate-100 px-2.5 py-0.5 rounded-full">
          <div className={`w-[6px] h-[6px] rounded-full ${platformOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className={`font-medium ${platformOnline ? 'text-emerald-600' : 'text-red-600'}`}>
            {platformOnline ? 'Platform Online' : 'Platform Offline'}
          </span>
        </div>
        {overview?.currentBranch && (
          <div className="ml-3 text-slate-400 font-medium truncate">
            {overview.currentBranch}{overview.currentCommit ? ` @ ${overview.currentCommit}` : ''}
          </div>
        )}
        <div className="ml-auto text-slate-400 font-medium">
          {activeProject.name} · {activeProject.environment}
        </div>
      </footer>
    </div>
  );
}
