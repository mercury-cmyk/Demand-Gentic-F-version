import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Activity,
  TrendingUp,
  Search,
  RefreshCw,
  Clock,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Play,
  Pause,
  Terminal,
  Wifi,
  WifiOff,
  Zap,
  Radio,
  Server,
  Database,
  Globe,
  Shield,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowDown,
  Sparkles,
  Eye,
  EyeOff
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
  labels?: Record<string, string>;
  jsonPayload?: any;
  textPayload?: string;
}

interface LogMetrics {
  totalLogs: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  recentErrors: LogEntry[];
  timeRange: { start: string; end: string };
}

interface ErrorSummary {
  errorType: string;
  count: number;
  lastOccurrence: string;
  samples: string[];
}

interface ActivityEvent {
  id: string;
  type: 'log' | 'error' | 'warning' | 'connection' | 'metric';
  message: string;
  timestamp: Date;
  severity?: string;
}

export default function CloudLogsMonitor() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeWindow, setTimeWindow] = useState<24 | 48 | 168>(24);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string[]>(['ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEFAULT']);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [realTimeLogs, setRealTimeLogs] = useState<LogEntry[]>([]);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [terminalMode, setTerminalMode] = useState(true);
  const [showActivityFeed, setShowActivityFeed] = useState(true);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [liveStats, setLiveStats] = useState({
    logsPerSecond: 0,
    errorsLast5Min: 0,
    warningsLast5Min: 0,
    connectionUptime: 0
  });
  const [newLogHighlight, setNewLogHighlight] = useState<Set<number>>(new Set());

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionStartRef = useRef<Date | null>(null);
  const logCountRef = useRef({ total: 0, lastCheck: Date.now() });

  // Add activity event helper
  const addActivityEvent = useCallback((type: ActivityEvent['type'], message: string, severity?: string) => {
    const event: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      timestamp: new Date(),
      severity
    };
    setActivityEvents(prev => [event, ...prev].slice(0, 100));
  }, []);

  // Calculate live stats
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - logCountRef.current.lastCheck) / 1000;
      const logsPerSecond = elapsed > 0 ? Math.round((realTimeLogs.length - logCountRef.current.total) / elapsed * 10) / 10 : 0;

      logCountRef.current = { total: realTimeLogs.length, lastCheck: now };

      const fiveMinAgo = new Date(now - 5 * 60 * 1000);
      const recentLogs = realTimeLogs.filter(l => new Date(l.timestamp) >= fiveMinAgo);

      setLiveStats({
        logsPerSecond: Math.max(0, logsPerSecond),
        errorsLast5Min: recentLogs.filter(l => l.severity?.toUpperCase() === 'ERROR').length,
        warningsLast5Min: recentLogs.filter(l => l.severity?.toUpperCase() === 'WARNING').length,
        connectionUptime: connectionStartRef.current
          ? Math.floor((now - connectionStartRef.current.getTime()) / 1000)
          : 0
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [realTimeLogs]);

  // WebSocket Connection with enhanced status tracking
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/log-stream`;

    const connectWebSocket = () => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      console.log('Connecting to Log Stream WebSocket:', wsUrl);
      addActivityEvent('connection', 'Connecting to log stream...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Log Stream');
        setIsWebSocketConnected(true);
        connectionStartRef.current = new Date();
        addActivityEvent('connection', 'Connected to real-time log stream');
      };

      ws.onmessage = (event) => {
        try {
          const newLog = JSON.parse(event.data) as LogEntry;
          setRealTimeLogs(prevLogs => {
            const updatedLogs = [...prevLogs, newLog];
            // Highlight new log
            setNewLogHighlight(prev => new Set([...prev, updatedLogs.length - 1]));
            setTimeout(() => {
              setNewLogHighlight(prev => {
                const next = new Set(prev);
                next.delete(updatedLogs.length - 1);
                return next;
              });
            }, 2000);

            if (updatedLogs.length > 1000) {
              return updatedLogs.slice(updatedLogs.length - 1000);
            }
            return updatedLogs;
          });

          // Add to activity feed for errors/warnings
          if (newLog.severity?.toUpperCase() === 'ERROR') {
            addActivityEvent('error', newLog.message.substring(0, 100), 'ERROR');
          } else if (newLog.severity?.toUpperCase() === 'WARNING') {
            addActivityEvent('warning', newLog.message.substring(0, 100), 'WARNING');
          }
        } catch (error) {
          console.error('Error parsing log message:', error);
        }
      };

      ws.onclose = () => {
        console.log('Log Stream disconnected');
        setIsWebSocketConnected(false);
        connectionStartRef.current = null;
        addActivityEvent('connection', 'Disconnected from log stream');
        if (autoRefresh) {
          setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = (error) => {
        console.error('Log Stream WebSocket error:', error);
        setIsWebSocketConnected(false);
        addActivityEvent('connection', 'Connection error occurred');
      };
    };

    if (autoRefresh) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [autoRefresh, addActivityEvent]);

  // Fetch recent logs (Historical)
  const { data: recentLogsData, refetch: refetchRecent } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/recent', { minutes: 5 }],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/cloud-logs/recent?minutes=5&limit=100');
      return await (response as any).json();
    },
    refetchInterval: !isWebSocketConnected && autoRefresh ? 10000 : false,
  });

  // Merge recent logs with real-time logs
  const allLogs = useMemo(() => {
    const historical = recentLogsData?.logs || [];
    if (realTimeLogs.length === 0) return historical;

    const firstRealTime = new Date(realTimeLogs[0].timestamp).getTime();
    const filteredHistorical = historical.filter(l => new Date(l.timestamp).getTime() < firstRealTime);

    return [...filteredHistorical, ...realTimeLogs].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [recentLogsData, realTimeLogs]);

  // Fetch metrics
  const { data: metrics, refetch: refetchMetrics } = useQuery<LogMetrics>({
    queryKey: ['/api/cloud-logs/metrics', { hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/metrics?hours=${timeWindow}`);
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch error summary
  const { data: errorSummary, refetch: refetchErrors } = useQuery<{ errors: ErrorSummary[]; totalTypes: number; totalErrors: number }>({
    queryKey: ['/api/cloud-logs/errors', { hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/errors?hours=${timeWindow}`);
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Search logs
  const { data: searchResults, refetch: refetchSearch } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/search', { q: searchQuery, hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/search?q=${encodeURIComponent(searchQuery)}&hours=${timeWindow}&limit=200`);
      return await (response as any).json();
    },
    enabled: searchQuery.length > 2,
  });

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allLogs, autoScroll]);

  const handleRefreshAll = () => {
    refetchRecent();
    refetchMetrics();
    refetchErrors();
    if (searchQuery.length > 2) refetchSearch();
    addActivityEvent('metric', 'Manual refresh triggered');
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'destructive';
      case 'WARNING':
        return 'default';
      case 'INFO':
        return 'secondary';
      case 'DEBUG':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getSeverityTextColor = (severity: string) => {
     switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'text-red-400';
      case 'WARNING':
        return 'text-amber-400';
      case 'INFO':
        return 'text-cyan-400';
      case 'DEBUG':
        return 'text-gray-500';
      default:
        return 'text-emerald-400';
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'INFO':
        return <Info className="h-4 w-4 text-cyan-500" />;
      default:
        return <Activity className="h-4 w-4 text-emerald-500" />;
    }
  };

  const getSeverityBgColor = (severity: string) => {
    if (terminalMode) return 'border-b border-gray-800/30 hover:bg-white/5';

    switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'bg-red-50 border-red-200 hover:bg-red-100';
      case 'WARNING':
        return 'bg-amber-50 border-amber-200 hover:bg-amber-100';
      case 'INFO':
        return 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100';
      default:
        return 'bg-gray-50 border-gray-200 hover:bg-gray-100';
    }
  };

  const toggleSeverityFilter = (severity: string) => {
    if (selectedSeverity.includes(severity)) {
      setSelectedSeverity(selectedSeverity.filter(s => s !== severity));
    } else {
      setSelectedSeverity([...selectedSeverity, severity]);
    }
  };

  const filteredLogs = allLogs.filter(log => {
    const sev = log.severity?.toUpperCase() || 'DEFAULT';
    return selectedSeverity.includes(sev) || selectedSeverity.includes('DEFAULT');
  });

  const exportLogs = () => {
    const logs = searchQuery.length > 2 ? searchResults?.logs : filteredLogs;
    if (!logs || logs.length === 0) return;

    const csv = [
      ['Timestamp', 'Severity', 'Message', 'Resource'].join(','),
      ...logs.map(log => [
        log.timestamp,
        log.severity,
        `"${log.message.replace(/"/g, '""')}"`,
        log.resource || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloud-logs-${new Date().toISOString()}.csv`;
    a.click();
    addActivityEvent('metric', 'Logs exported to CSV');
  };

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const renderLogDetail = (log: LogEntry, index: number) => {
    const isExpanded = expandedLog === index;
    const isNew = newLogHighlight.has(index);

    if (terminalMode) {
      return (
        <div
          key={index}
          className={`font-mono text-xs py-1.5 px-2 rounded cursor-pointer flex gap-4 transition-all duration-500 ${
            isNew ? 'bg-emerald-500/20 border-l-2 border-emerald-400' : 'hover:bg-white/5'
          }`}
          onClick={() => setExpandedLog(isExpanded ? null : index)}
        >
          <span className="text-gray-600 shrink-0 select-none tabular-nums">
             {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
          </span>
          <span className={`shrink-0 w-16 font-bold uppercase ${getSeverityTextColor(log.severity)}`}>
            {log.severity || 'LOG'}
          </span>
          <span className="text-gray-300 break-all whitespace-pre-wrap flex-1 leading-relaxed">
            {log.message}
            {isExpanded && log.jsonPayload && (
               <pre className="mt-2 text-[10px] text-gray-400 bg-black/50 p-2 rounded overflow-x-auto border border-gray-800">
                 {JSON.stringify(log.jsonPayload, null, 2)}
               </pre>
            )}
            {isExpanded && log.labels && (
              <div className="mt-2 flex flex-wrap gap-1">
                 {Object.entries(log.labels).map(([k,v]) => (
                   <span key={k} className="bg-gray-800/80 px-1.5 py-0.5 rounded text-gray-400 text-[10px] border border-gray-700">{k}={v}</span>
                 ))}
              </div>
            )}
          </span>
        </div>
      );
    }

    return (
      <div
        key={index}
        className={`border rounded-lg transition-all ${getSeverityBgColor(log.severity)} ${isNew ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
      >
        <div
          className="flex items-start gap-3 p-4 cursor-pointer"
          onClick={() => setExpandedLog(isExpanded ? null : index)}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 mt-1 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 mt-1 flex-shrink-0" />
          )}

          {getSeverityIcon(log.severity)}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={getSeverityColor(log.severity) as any} className="text-xs">
                {log.severity || 'LOG'}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss.SSS')}
              </span>
              <span className="text-xs text-muted-foreground">
                ({formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })})
              </span>
              {log.resource && (
                <Badge variant="outline" className="text-xs">
                  {log.resource}
                </Badge>
              )}
            </div>
            <p className={`font-mono text-xs ${isExpanded ? '' : 'line-clamp-2'}`}>
              {log.message}
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="border-t px-4 pb-4 space-y-4 bg-white/50">
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Message:</h4>
              <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {log.message}
              </pre>
            </div>

            {log.labels && Object.keys(log.labels).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Labels:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(log.labels).map(([key, value]) => (
                    <div key={key} className="bg-muted p-2 rounded">
                      <span className="text-xs font-mono font-semibold">{key}:</span>
                      <span className="text-xs font-mono ml-2">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {log.jsonPayload && (
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">JSON Payload:</h4>
                <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto max-h-96">
                  {JSON.stringify(log.jsonPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderActivityEvent = (event: ActivityEvent) => {
    const getEventIcon = () => {
      switch (event.type) {
        case 'error': return <AlertCircle className="h-3 w-3 text-red-400" />;
        case 'warning': return <AlertTriangle className="h-3 w-3 text-amber-400" />;
        case 'connection': return <Radio className="h-3 w-3 text-cyan-400" />;
        default: return <Activity className="h-3 w-3 text-emerald-400" />;
      }
    };

    return (
      <div key={event.id} className="flex items-start gap-2 py-2 px-3 text-xs border-b border-gray-800/50 hover:bg-white/5 transition-colors">
        {getEventIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-gray-300 truncate">{event.message}</p>
          <p className="text-gray-600 text-[10px]">{format(event.timestamp, 'HH:mm:ss')}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />

      <div className="relative container mx-auto py-6 space-y-6 max-w-[1800px]">
        {/* Header with live status */}
        <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800/50 p-6 shadow-2xl">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className={`absolute inset-0 rounded-full blur-xl ${isWebSocketConnected ? 'bg-emerald-500/30 animate-pulse' : 'bg-red-500/20'}`} />
              <div className={`relative h-16 w-16 rounded-full flex items-center justify-center border-2 ${
                isWebSocketConnected
                  ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 border-emerald-400/50'
                  : 'bg-gradient-to-br from-red-500 to-orange-500 border-red-400/50'
              }`}>
                {isWebSocketConnected ? (
                  <Radio className="h-8 w-8 text-white animate-pulse" />
                ) : (
                  <WifiOff className="h-8 w-8 text-white" />
                )}
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                Cloud Run Logs
                <Badge className={`${
                  isWebSocketConnected
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                } animate-pulse`}>
                  {isWebSocketConnected ? 'LIVE' : 'OFFLINE'}
                </Badge>
              </h1>
              <p className="text-slate-400 mt-1 flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Server className="h-4 w-4" />
                  demandgentic-api
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4" />
                  us-central1
                </span>
                {isWebSocketConnected && (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Clock className="h-4 w-4" />
                    Uptime: {formatUptime(liveStats.connectionUptime)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
              <Switch
                id="terminal-mode"
                checked={terminalMode}
                onCheckedChange={setTerminalMode}
                className="data-[state=checked]:bg-emerald-500"
              />
              <Label htmlFor="terminal-mode" className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm">
                <Terminal className="h-4 w-4" />
                Terminal
              </Label>
            </div>

            <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50">
              <Switch
                id="activity-feed"
                checked={showActivityFeed}
                onCheckedChange={setShowActivityFeed}
                className="data-[state=checked]:bg-cyan-500"
              />
              <Label htmlFor="activity-feed" className="flex items-center gap-2 cursor-pointer text-slate-300 text-sm">
                {showActivityFeed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Activity
              </Label>
            </div>

            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(parseInt(e.target.value) as any)}
              className="border border-slate-700 rounded-xl px-4 py-2 text-sm bg-slate-800/50 text-slate-300 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            >
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={168}>Last 7 days</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`border-slate-700 ${autoRefresh ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800/50 text-slate-400'}`}
            >
              {autoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {autoRefresh ? 'Streaming' : 'Paused'}
            </Button>

            <Button onClick={handleRefreshAll} size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>

            <Button onClick={exportLogs} size="sm" variant="outline" className="border-slate-700 bg-slate-800/50 text-slate-300">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Live Stats Bar */}
        <div className="grid grid-cols-6 gap-4">
          {[
            { icon: Zap, label: 'Logs/sec', value: liveStats.logsPerSecond.toFixed(1), color: 'cyan', pulse: liveStats.logsPerSecond > 0 },
            { icon: Activity, label: 'Total Logs', value: filteredLogs.length.toLocaleString(), color: 'emerald' },
            { icon: AlertCircle, label: 'Errors (5m)', value: liveStats.errorsLast5Min, color: 'red', pulse: liveStats.errorsLast5Min > 0 },
            { icon: AlertTriangle, label: 'Warnings (5m)', value: liveStats.warningsLast5Min, color: 'amber', pulse: liveStats.warningsLast5Min > 0 },
            { icon: Database, label: 'Total (24h)', value: (metrics?.totalLogs || 0).toLocaleString(), color: 'purple' },
            { icon: Shield, label: 'Error Rate', value: metrics?.totalLogs ? `${((metrics.errorCount / metrics.totalLogs) * 100).toFixed(2)}%` : '0%', color: 'orange' },
          ].map((stat, idx) => (
            <Card key={idx} className={`bg-slate-900/80 border-slate-800/50 backdrop-blur-xl overflow-hidden relative group`}>
              <div className={`absolute inset-0 bg-gradient-to-br from-${stat.color}-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              {stat.pulse && <div className={`absolute top-2 right-2 h-2 w-2 rounded-full bg-${stat.color}-400 animate-pulse`} />}
              <CardContent className="p-4 relative">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${stat.color}-500/20`}>
                    <stat.icon className={`h-5 w-5 text-${stat.color}-400`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
                    <p className={`text-2xl font-bold text-${stat.color}-400 tabular-nums`}>{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex gap-6">
          {/* Main Logs Panel */}
          <div className="flex-1 space-y-6">
            {/* Search and Filters */}
            <Card className="bg-slate-900/80 border-slate-800/50 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Search className="h-5 w-5 text-cyan-400" />
                      Search & Filter
                    </CardTitle>
                    <CardDescription className="text-slate-500">Filter logs by severity and search content</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="border-slate-700 bg-slate-800/50 text-slate-300"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    {showFilters ? 'Hide' : 'Show'} Filters
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      placeholder="Search logs... (minimum 3 characters)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500/50"
                    />
                  </div>
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {showFilters && (
                  <div className="space-y-3 p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <h4 className="text-sm font-semibold text-slate-300">Severity Levels:</h4>
                    <div className="flex flex-wrap gap-2">
                      {['ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEFAULT'].map(severity => (
                        <Button
                          key={severity}
                          variant={selectedSeverity.includes(severity) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleSeverityFilter(severity)}
                          className={`text-xs ${
                            selectedSeverity.includes(severity)
                              ? severity === 'ERROR' ? 'bg-red-500 hover:bg-red-600'
                                : severity === 'WARNING' ? 'bg-amber-500 hover:bg-amber-600'
                                : severity === 'INFO' ? 'bg-cyan-500 hover:bg-cyan-600'
                                : severity === 'DEBUG' ? 'bg-gray-500 hover:bg-gray-600'
                                : 'bg-emerald-500 hover:bg-emerald-600'
                              : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-white'
                          }`}
                        >
                          {getSeverityIcon(severity)}
                          <span className="ml-2">{severity}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Log Stream */}
            <Card className={`${terminalMode ? 'bg-[#0a0a0a]' : 'bg-slate-900/80'} border-slate-800/50 backdrop-blur-xl overflow-hidden`}>
              <CardHeader className={`${terminalMode ? 'border-b border-slate-800/50 bg-slate-900/50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className={`${terminalMode ? 'text-emerald-400 font-mono' : 'text-white'} flex items-center gap-2`}>
                      {terminalMode ? (
                        <>
                          <Terminal className="h-5 w-5" />
                          ~/logs/cloud-run
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5 text-cyan-400" />
                          Live Log Stream
                        </>
                      )}
                    </CardTitle>
                    <CardDescription className={terminalMode ? 'text-slate-600 font-mono text-xs' : 'text-slate-500'}>
                      {filteredLogs.length} logs • {isWebSocketConnected ? 'Real-time streaming' : 'Polling mode'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAutoScroll(!autoScroll)}
                      className={`${terminalMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'border-slate-700 bg-slate-800/50 text-slate-300'}`}
                    >
                      <ArrowDown className={`h-4 w-4 mr-2 ${autoScroll ? 'animate-bounce' : ''}`} />
                      Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <div className={`${terminalMode ? 'p-4 font-mono text-sm space-y-0' : 'p-4 space-y-2'}`}>
                    {filteredLogs.length > 0 ? (
                      <>
                        {filteredLogs.map((log, idx) => renderLogDetail(log, idx))}
                        <div ref={logsEndRef} />
                      </>
                    ) : (
                      <div className="text-center py-20">
                        <div className={`relative inline-block ${isWebSocketConnected ? 'animate-pulse' : ''}`}>
                          <Activity className={`h-16 w-16 mx-auto mb-4 ${terminalMode ? 'text-emerald-500/30' : 'text-slate-600'}`} />
                          {isWebSocketConnected && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="h-4 w-4 rounded-full bg-emerald-500 animate-ping" />
                            </div>
                          )}
                        </div>
                        <p className={terminalMode ? 'text-slate-600' : 'text-slate-500'}>
                          {isWebSocketConnected ? 'Waiting for incoming logs...' : 'No logs matching current filters'}
                        </p>
                        {!isWebSocketConnected && (
                          <p className="text-xs mt-2 text-amber-500">
                            WebSocket disconnected. Attempting to reconnect...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Error Analysis Tabs */}
            <Tabs defaultValue="errors" className="space-y-4">
              <TabsList className="bg-slate-900/80 border border-slate-800/50 p-1">
                <TabsTrigger value="errors" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Error Analysis
                </TabsTrigger>
                <TabsTrigger value="timeline" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Clock className="h-4 w-4 mr-2" />
                  Error Timeline
                </TabsTrigger>
              </TabsList>

              <TabsContent value="errors">
                <Card className="bg-slate-900/80 border-slate-800/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      Error Analysis
                    </CardTitle>
                    <CardDescription className="text-slate-500">Grouped errors with occurrence counts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3 pr-4">
                        {errorSummary?.errors && errorSummary.errors.length > 0 ? (
                          errorSummary.errors.map((error, idx) => (
                            <div key={idx} className="border border-red-500/30 rounded-xl p-4 bg-red-500/10">
                              <div className="flex items-start justify-between mb-3">
                                <h3 className="font-semibold flex items-center gap-2 text-red-400">
                                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                  <span className="break-all">{error.errorType}</span>
                                </h3>
                                <Badge variant="destructive" className="font-mono">
                                  {error.count}x
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 mb-3">
                                Last seen: {format(new Date(error.lastOccurrence), 'MMM dd, HH:mm:ss')}
                              </p>
                              {error.samples.slice(0, 2).map((sample, sIdx) => (
                                <pre key={sIdx} className="text-xs font-mono bg-slate-900/80 text-slate-400 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap break-all mb-2">
                                  {sample}
                                </pre>
                              ))}
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-12 text-slate-500">
                            <Shield className="h-12 w-12 mx-auto mb-3 text-emerald-500/50" />
                            <p>No errors in the selected time window</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline">
                <Card className="bg-slate-900/80 border-slate-800/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Clock className="h-5 w-5 text-cyan-400" />
                      Error Timeline
                    </CardTitle>
                    <CardDescription className="text-slate-500">Recent errors in chronological order</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2 pr-4">
                        {metrics?.recentErrors && metrics.recentErrors.length > 0 ? (
                          metrics.recentErrors.map((error, idx) => renderLogDetail(error, idx + 1000))
                        ) : (
                          <div className="text-center py-12 text-slate-500">
                            <Clock className="h-12 w-12 mx-auto mb-3 text-emerald-500/50" />
                            <p>No recent errors</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Activity Feed Sidebar */}
          {showActivityFeed && (
            <div className="w-80 space-y-4">
              <Card className="bg-slate-900/80 border-slate-800/50 backdrop-blur-xl sticky top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <Radio className="h-4 w-4 text-cyan-400 animate-pulse" />
                    Live Activity Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]">
                    <div className="divide-y divide-slate-800/50">
                      {activityEvents.length > 0 ? (
                        activityEvents.map(renderActivityEvent)
                      ) : (
                        <div className="text-center py-8 text-slate-600 text-sm">
                          <Radio className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                          <p>Waiting for activity...</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="bg-slate-900/80 border-slate-800/50 backdrop-blur-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Quick Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Real-time logs</span>
                    <span className="text-emerald-400 font-mono">{realTimeLogs.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Connection</span>
                    <span className={isWebSocketConnected ? 'text-emerald-400' : 'text-red-400'}>
                      {isWebSocketConnected ? 'Active' : 'Disconnected'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Filters active</span>
                    <span className="text-cyan-400">{selectedSeverity.length}/5</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Time window</span>
                    <span className="text-slate-300">{timeWindow}h</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Floating Status Indicator */}
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
          isWebSocketConnected ? 'opacity-100' : 'opacity-90'
        }`}>
          <div className={`flex items-center gap-4 px-6 py-3 rounded-full backdrop-blur-xl border shadow-2xl ${
            isWebSocketConnected
              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/20 border-red-500/30 text-red-400'
          }`}>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${isWebSocketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="font-medium text-sm">
                {isWebSocketConnected ? 'Live Stream Active' : 'Reconnecting...'}
              </span>
            </div>
            <div className="h-4 w-px bg-current opacity-30" />
            <span className="text-sm tabular-nums">
              {filteredLogs.length} logs
            </span>
            {isWebSocketConnected && liveStats.logsPerSecond > 0 && (
              <>
                <div className="h-4 w-px bg-current opacity-30" />
                <span className="text-sm flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {liveStats.logsPerSecond}/s
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
