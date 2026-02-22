import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  ChevronRight,
  ChevronDown,
  Plus,
  Send,
  Loader2,
  Package,
  Settings,
  Code2,
} from 'lucide-react';
import SecretsTab from '@/components/ops/secrets-tab';
import DevLogsTab from '@/components/ops/dev-logs-tab';
import ProdLogsTab from '@/components/ops/prod-logs-tab';
import CostsTab from '@/components/ops/costs-tab';
import DeploymentsTab from '@/components/ops/deployments-tab';
import DomainsTab from '@/components/ops/domains-tab';
import AgentsTab from '@/components/ops/agents-tab';
import FileManagerTab from '@/components/ops/file-manager-tab';
import PreviewTab from '@/components/ops/preview-tab';
import { useToast } from '@/hooks/use-toast';

// ===== TYPES =====
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  latencyMs?: number;
}

// ===== SIDEBAR NAV ITEMS =====
interface NavSection {
  label: string;
  items: { id: string; label: string; icon: React.ReactNode; badge?: string }[];
}

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
      { id: 'deployments', label: 'Deployments', icon: <Zap className="w-4 h-4" /> },
      { id: 'domains', label: 'Domains & DNS', icon: <Globe className="w-4 h-4" /> },
      { id: 'secrets', label: 'Secrets & Env', icon: <Lock className="w-4 h-4" /> },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'dev-logs', label: 'Dev Logs', icon: <FileText className="w-4 h-4" /> },
      { id: 'prod-logs', label: 'Prod Logs', icon: <FileText className="w-4 h-4" /> },
      { id: 'costs', label: 'Cost Analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'agents', label: 'AI Agents', icon: <Bot className="w-4 h-4" /> },
    ],
  },
];

// ===== TOP NAV TABS =====
const TOP_TABS = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'devops', label: 'DevOps' },
  { id: 'insights', label: 'Insights' },
];

// Map top tab to first item in that section
const TAB_TO_SECTION: Record<string, string> = {
  workspace: 'WORKSPACE',
  devops: 'DEVOPS',
  insights: 'INSIGHTS',
};

// Map page id to top tab section
function getTopTabForPage(pageId: string): string {
  for (const section of NAV_SECTIONS) {
    if (section.items.some(i => i.id === pageId)) {
      const key = Object.entries(TAB_TO_SECTION).find(([, v]) => v === section.label)?.[0];
      return key || 'workspace';
    }
  }
  return 'workspace';
}

export default function OpsHub() {
  const { toast } = useToast();
  const [activePage, setActivePage] = useState('files');
  const [activeTopTab, setActiveTopTab] = useState('workspace');
  const [platformOnline, setPlatformOnline] = useState(true);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatMode, setChatMode] = useState('simple-edit');
  const [chatRoute, setChatRoute] = useState('auto');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Health check
  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
        setPlatformOnline(res.ok);
      } catch {
        setPlatformOnline(false);
      }
    };
    checkPlatform();
    const iv = setInterval(checkPlatform, 30000);
    return () => clearInterval(iv);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Navigate to page
  const goToPage = (pageId: string) => {
    setActivePage(pageId);
    setActiveTopTab(getTopTabForPage(pageId));
  };

  // Navigate via top tab (jump to first item in that section)
  const goToTab = (tabId: string) => {
    setActiveTopTab(tabId);
    const sectionLabel = TAB_TO_SECTION[tabId];
    const section = NAV_SECTIONS.find(s => s.label === sectionLabel);
    if (section && section.items.length > 0) {
      setActivePage(section.items[0].id);
    }
  };

  // AI Chat send
  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim(), timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    const prompt = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    try {
      const res = await fetch('/api/ops/agents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          task: chatMode === 'simple-edit' ? 'code' : chatMode === 'debug' ? 'analysis' : 'general',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.response?.result || data.response?.text || 'No response generated.',
          timestamp: new Date(),
          provider: data.response?.provider,
          latencyMs: data.response?.latencyMs,
        };
        setChatMessages(prev => [...prev, assistantMsg]);
      } else {
        const err = await res.json().catch(() => ({}));
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${err.error || 'Failed to get response'}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${String(err)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setChatSending(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  // Get sidebar items filtered by active top tab
  const activeSections = NAV_SECTIONS.filter(s => s.label === TAB_TO_SECTION[activeTopTab]);

  // Render the active page content
  const renderContent = () => {
    switch (activePage) {
      case 'secrets': return <SecretsTab />;
      case 'dev-logs': return <DevLogsTab />;
      case 'prod-logs': return <ProdLogsTab />;
      case 'costs': return <CostsTab />;
      case 'deployments': return <DeploymentsTab />;
      case 'domains': return <DomainsTab />;
      case 'agents': return <AgentsTab />;
      case 'files': return <FileManagerTab />;
      case 'preview': return <PreviewTab />;
      default: return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500">
          <Code2 className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">Select a section to get started</p>
        </div>
      );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0f1117] text-white overflow-hidden font-sans">
      {/* ===== TOP NAVIGATION BAR ===== */}
      <header className="h-[52px] border-b border-white/[0.06] bg-[#161821]/90 backdrop-blur-xl flex items-center px-5 shrink-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            DemandGentic
          </span>
        </div>

        {/* Active project name + badge */}
        <div className="flex items-center gap-2.5 mr-8 pl-8 border-l border-white/[0.06]">
          <span className="text-sm font-semibold text-slate-100">Operations Hub</span>
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px] px-2 py-0.5 uppercase tracking-wider font-bold rounded-full">
            Stable
          </Badge>
        </div>

        {/* Top tabs */}
        <nav className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
          {TOP_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200 ${
                activeTopTab === tab.id
                  ? 'text-white bg-white/[0.1] shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side icons */}
        <div className="ml-auto flex items-center gap-1">
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all relative">
            <Bell className="w-4 h-4" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center ml-2 ring-2 ring-white/[0.08] shadow-lg shadow-teal-500/10 cursor-pointer">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      {/* ===== MAIN BODY (3-column) ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* ===== LEFT SIDEBAR ===== */}
        <aside className="w-56 border-r border-white/[0.06] bg-[#161821]/80 backdrop-blur-sm flex flex-col shrink-0">
          {/* Nav sections */}
          <div className="flex-1 overflow-y-auto py-4 px-2">
            {activeSections.map(section => (
              <div key={section.label} className="mb-5">
                <div className="px-3 mb-2.5">
                  <span className="text-[10px] font-bold text-slate-500/80 tracking-[0.15em] uppercase">
                    {section.label}
                  </span>
                </div>
                {section.items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => goToPage(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] rounded-lg transition-all duration-200 mb-0.5 ${
                      activePage === item.id
                        ? 'bg-gradient-to-r from-teal-500/15 to-cyan-500/10 text-teal-300 shadow-sm shadow-teal-500/5'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={activePage === item.id ? 'text-teal-400' : ''}>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    {item.badge && (
                      <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">{item.badge}</Badge>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* All Sections (collapsed) — shown below current section */}
            <div className="border-t border-white/[0.04] mt-3 pt-4">
              <div className="px-3 mb-2.5">
                <span className="text-[10px] font-bold text-slate-500/60 tracking-[0.15em] uppercase">
                  Quick Access
                </span>
              </div>
              {NAV_SECTIONS.filter(s => s.label !== TAB_TO_SECTION[activeTopTab]).map(section => (
                <div key={section.label} className="mb-0.5">
                  {section.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => goToPage(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
                        activePage === item.id
                          ? 'bg-teal-500/10 text-teal-300'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
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

          {/* Bottom of sidebar */}
          <div className="border-t border-white/[0.04] px-3 py-3">
            <button className="w-full flex items-center gap-2 text-sm text-slate-500 hover:text-teal-300 rounded-lg px-3 py-2 hover:bg-white/[0.04] transition-all">
              <Plus className="w-4 h-4" />
              <span className="font-medium">New Service</span>
            </button>
          </div>
        </aside>

        {/* ===== CENTER CONTENT ===== */}
        <main className="flex-1 overflow-y-auto bg-[#0f1117]">
          <div className="p-6">
            {renderContent()}
          </div>
        </main>

        {/* ===== RIGHT PANEL — AI AGENT ===== */}
        <aside className="w-[340px] border-l border-white/[0.06] bg-[#161821]/80 backdrop-blur-sm flex flex-col shrink-0">
          {/* Agent header */}
          <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-[13px] font-semibold text-white">AI Coding Agent</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Active</span>
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-white/[0.06] flex items-center justify-center mb-4">
                  <Bot className="w-7 h-7 text-violet-400" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">How can I help with this app today?</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/15 text-teal-50 border border-teal-500/10'
                    : 'bg-white/[0.04] text-slate-200 border border-white/[0.06]'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.provider && (
                    <p className="text-[10px] text-slate-500 mt-1.5 font-medium">
                      via {msg.provider} &middot; {msg.latencyMs}ms
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-white/[0.06] p-3.5 space-y-2.5">
            {/* Mode selectors */}
            <div className="flex gap-2">
              <Select value={chatMode} onValueChange={setChatMode}>
                <SelectTrigger className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-slate-300 flex-1 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple-edit">Simple Edit</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="deploy">Deploy</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
              <Select value={chatRoute} onValueChange={setChatRoute}>
                <SelectTrigger className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-slate-300 w-[120px] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto Route</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="copilot">Copilot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Text input */}
            <div className="relative">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Ask the agent to modify code, fix bugs, or deploy..."
                className="min-h-[64px] max-h-[120px] bg-white/[0.03] border-white/[0.08] text-sm text-white placeholder:text-slate-500/70 resize-none pr-11 rounded-xl focus:border-teal-500/30 focus:ring-teal-500/10"
                rows={2}
              />
              <button
                onClick={handleChatSend}
                disabled={chatSending || !chatInput.trim()}
                className="absolute right-2.5 bottom-2.5 p-2 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-30 disabled:hover:from-teal-500 disabled:hover:to-cyan-500 transition-all shadow-lg shadow-teal-500/20"
              >
                {chatSending
                  ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  : <Send className="w-3.5 h-3.5 text-white" />}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ===== BOTTOM STATUS BAR ===== */}
      <footer className="h-8 border-t border-white/[0.06] bg-[#161821]/90 backdrop-blur-xl flex items-center px-5 shrink-0 text-[11px]">
        <span className="text-slate-500 font-medium">v1.0.4-stable</span>
        <div className="ml-5 flex items-center gap-2 bg-white/[0.03] px-2.5 py-1 rounded-full">
          <div className={`w-[6px] h-[6px] rounded-full ${platformOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-400 shadow-sm shadow-red-400/50'}`} />
          <span className={`font-medium ${platformOnline ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
            {platformOnline ? 'Platform Online' : 'Platform Offline'}
          </span>
        </div>
        <div className="ml-auto text-slate-500/60 font-medium">
          Google Cloud Platform Native
        </div>
      </footer>
    </div>
  );
}
