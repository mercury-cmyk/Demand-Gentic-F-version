import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  WifiOff
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

export default function CloudLogsMonitor() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeWindow, setTimeWindow] = useState<24 | 48 | 168>(24);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedSeverity, setSelectedSeverity] = useState<string[]>(['ERROR', 'WARNING', 'INFO']);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [realTimeLogs, setRealTimeLogs] = useState<LogEntry[]>([]);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [terminalMode, setTerminalMode] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket Connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/log-stream`;

    const connectWebSocket = () => {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
      }

      console.log('Connecting to Log Stream WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Log Stream');
        setIsWebSocketConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const newLog = JSON.parse(event.data) as LogEntry;
          setRealTimeLogs(prevLogs => {
            // Keep last 1000 logs to prevent memory issues
            const updatedLogs = [...prevLogs, newLog];
            if (updatedLogs.length > 1000) {
              return updatedLogs.slice(updatedLogs.length - 1000);
            }
            return updatedLogs;
          });
        } catch (error) {
          console.error('Error parsing log message:', error);
        }
      };

      ws.onclose = () => {
        console.log('Log Stream disconnected');
        setIsWebSocketConnected(false);
        // Attempt reconnect after 5 seconds if autoRefresh is on
        if (autoRefresh) {
          setTimeout(connectWebSocket, 5000);
        }
      };

      ws.onerror = (error) => {
        console.error('Log Stream WebSocket error:', error);
        setIsWebSocketConnected(false);
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
  }, [autoRefresh]);

  // Fetch recent logs (Historical)
  const { data: recentLogsData, refetch: refetchRecent } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/recent', { minutes: 5 }],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/cloud-logs/recent?minutes=5&limit=100');
      return await (response as any).json();
    },
    // Disable polling if WebSocket is connected to avoid duplication/overhead
    // But keep it initially or if WS fails
    refetchInterval: !isWebSocketConnected && autoRefresh ? 10000 : false, 
  });

  // Merge recent logs (historical) with real-time logs
  // We use a Map to deduplicate based on timestamp + message (primitive key)
  // Note: Google Cloud Logs have an insertId, but our interface might not expose it.
  const allLogs = useMemo(() => {
    const historical = recentLogsData?.logs || [];
    // If we have real-time logs, prefer them, but filling initial state with historical is good.
    // However, simply concatenating might duplicate.
    // Let's just show real-time logs if we have them, otherwise show historical.
    // OR: Prepend historical to real-time.
    
    // Simple strategy: Start with historical, append real-time.
    // To avoid dupes from the overlap period:
    // Filter real-time logs that are ALREADY in historical (unlikely if historical is old)
    // Filter historical logs that are older than the first real-time log?
    
    if (realTimeLogs.length === 0) return historical;
    
    const firstRealTime = new Date(realTimeLogs[0].timestamp).getTime();
    const filteredHistorical = historical.filter(l => new Date(l.timestamp).getTime() < firstRealTime);
    
    // Sort combined by timestamp asc
    return [...filteredHistorical, ...realTimeLogs].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [recentLogsData, realTimeLogs]);

  // Fetch metrics

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

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [allLogs, autoScroll]); // Changed dependency from recentLogs to allLogs

  const handleRefreshAll = () => {
    refetchRecent();
    refetchMetrics();
    refetchErrors();
    if (searchQuery.length > 2) refetchSearch();
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
        return 'text-red-500';
      case 'WARNING':
        return 'text-yellow-500';
      case 'INFO':
        return 'text-blue-500';
      case 'DEBUG':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    } 
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'INFO':
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSeverityBgColor = (severity: string) => {
    if (terminalMode) return 'border-b border-gray-800 hover:bg-white/5';

    switch (severity?.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'bg-red-50 border-red-200 hover:bg-red-100';
      case 'WARNING':
        return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100';
      case 'INFO':
        return 'bg-blue-50 border-blue-200 hover:bg-blue-100';
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

  const filteredLogs = allLogs.filter(log =>
    selectedSeverity.includes(log.severity?.toUpperCase())
  );

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
  };

  const renderLogDetail = (log: LogEntry, index: number) => {
    const isExpanded = expandedLog === index;

    if (terminalMode) {
      return (
        <div 
          key={index} 
          className="font-mono text-xs py-1 border-gray-800/50 hover:bg-white/5 cursor-pointer flex gap-4"
          onClick={() => setExpandedLog(isExpanded ? null : index)}
        >
          <span className="text-gray-500 shrink-0 select-none">
             {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
          </span>
          <span className={`shrink-0 w-16 font-bold ${getSeverityTextColor(log.severity)}`}>
            {log.severity}
          </span>
          <span className="text-gray-300 break-all whitespace-pre-wrap flex-1">
            {log.message}
            {isExpanded && log.jsonPayload && (
               <pre className="mt-2 text-[10px] text-gray-400 bg-black/50 p-2 rounded overflow-x-auto">
                 {JSON.stringify(log.jsonPayload, null, 2)}
               </pre>
            )}
            {isExpanded && log.labels && (
              <div className="mt-1 flex flex-wrap gap-1">
                 {Object.entries(log.labels).map(([k,v]) => (
                   <span key={k} className="bg-gray-800 px-1 rounded text-gray-400 text-[10px]">{k}={v}</span>
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
        className={`border rounded-lg transition-all ${getSeverityBgColor(log.severity)}`}
      >

        {/* Log Header - Always Visible */}
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
                {log.severity}
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

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t px-4 pb-4 space-y-4 bg-white/50">
            {/* Full Message */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Message:</h4>
              <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
                {log.message}
              </pre>
            </div>

            {/* Labels */}
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

            {/* JSON Payload */}
            {log.jsonPayload && (
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">JSON Payload:</h4>
                <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto max-h-96">
                  {JSON.stringify(log.jsonPayload, null, 2)}
                </pre>
              </div>
            )}

            {/* Text Payload */}
            {log.textPayload && log.textPayload !== log.message && (
              <div>
                <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Raw Text:</h4>
                <pre className="text-xs font-mono bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
                  {log.textPayload}
                </pre>
              </div>
            )}

            {/* Metadata */}
            <div>
              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Metadata:</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted p-2 rounded">
                  <span className="font-semibold">Timestamp:</span>
                  <div className="font-mono mt-1">{new Date(log.timestamp).toISOString()}</div>
                </div>
                <div className="bg-muted p-2 rounded">
                  <span className="font-semibold">Severity:</span>
                  <div className="font-mono mt-1">{log.severity}</div>
                </div>
                {log.resource && (
                  <div className="bg-muted p-2 rounded">
                    <span className="font-semibold">Resource:</span>
                    <div className="font-mono mt-1">{log.resource}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cloud Run Logs</h1>
          <div className="flex items-center gap-2 mt-1">
             <p className="text-muted-foreground">Monitor Google Cloud Run application logs in real-time</p>
             {isWebSocketConnected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                  <Wifi className="h-3 w-3" /> Connected
                </Badge>
             ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                   <WifiOff className="h-3 w-3" /> Disconnected
                </Badge>
             )}
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center space-x-2 mr-4 bg-muted/50 p-1.5 rounded-lg border">
              <Switch 
                id="terminal-mode" 
                checked={terminalMode}
                onCheckedChange={setTerminalMode}
              />
              <Label htmlFor="terminal-mode" className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                <Terminal className="h-4 w-4" />
                Terminal View
              </Label>
           </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Time Window:</label>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(parseInt(e.target.value) as any)}
              className="border rounded px-3 py-1 text-sm bg-background"
            >
              <option value={24}>Last 24 hours</option>
              <option value={48}>Last 48 hours</option>
              <option value={168}>Last 7 days</option>
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
          <Button onClick={handleRefreshAll} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportLogs} size="sm" variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalLogs?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics?.errorCount?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {errorSummary?.totalTypes || 0} distinct types
            </p>
          </CardContent>
        </Card>

        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{metrics?.warningCount?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Info Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{metrics?.infoCount?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Search & Filter</CardTitle>
              <CardDescription>Search and filter cloud logs</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs... (minimum 3 characters)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Severity Filters */}
          {showFilters && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div>
                <h4 className="text-sm font-semibold mb-2">Severity Levels:</h4>
                <div className="flex flex-wrap gap-2">
                  {['ERROR', 'WARNING', 'INFO', 'DEBUG'].map(severity => (
                    <Button
                      key={severity}
                      variant={selectedSeverity.includes(severity) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleSeverityFilter(severity)}
                      className="text-xs"
                    >
                      {getSeverityIcon(severity)}
                      <span className="ml-2">{severity}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchQuery.length > 2 && searchResults && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {searchResults.count} result{searchResults.count !== 1 ? 's' : ''} found
                </p>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {searchResults.logs.map((log, idx) => renderLogDetail(log, idx))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="recent">Recent Logs (Live)</TabsTrigger>
          <TabsTrigger value="errors">Error Analysis</TabsTrigger>
          <TabsTrigger value="timeline">Error Timeline</TabsTrigger>
        </TabsList>

        {/* Recent Logs Tab */}
        <TabsContent value="recent" className="space-y-4">
          <Card className={terminalMode ? "bg-[#0c0c0c] border-gray-800 text-gray-300" : ""}>
            <CardHeader className={terminalMode ? "border-b border-gray-800" : ""}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className={terminalMode ? "text-gray-100" : ""}>Live Log Stream</CardTitle>
                  <CardDescription className={terminalMode ? "text-gray-500" : ""}>
                    Real-time logs • {filteredLogs.length} logs shown • {isWebSocketConnected ? 'Streaming' : 'Polling'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={terminalMode ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={terminalMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : ""}
                  >
                    Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className={`space-y-0 max-h-[700px] overflow-y-auto ${terminalMode ? 'p-4 font-mono text-sm' : 'p-4 space-y-2'}`}>
                {filteredLogs.length > 0 ? (
                  <>
                    {filteredLogs.map((log, idx) => renderLogDetail(log, idx))}
                    <div ref={logsEndRef} />
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No logs matching current filters</p>
                    <p className="text-sm mt-1">Try adjusting the severity filters</p>
                    {!isWebSocketConnected && (
                         <p className="text-xs mt-4 text-orange-500">WebSocket disconnected. Waiting for connection...</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Error Analysis</CardTitle>
              <CardDescription>Grouped errors with occurrence counts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {errorSummary?.errors && errorSummary.errors.length > 0 ? (
                  errorSummary.errors.map((error, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-red-50/30 border-red-200">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2 text-red-900">
                          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                          <span className="break-all">{error.errorType}</span>
                        </h3>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          <Badge variant="destructive" className="font-mono">
                            {error.count} {error.count === 1 ? 'occurrence' : 'occurrences'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">
                        Last seen: {format(new Date(error.lastOccurrence), 'MMM dd, yyyy HH:mm:ss')}
                        ({formatDistanceToNow(new Date(error.lastOccurrence), { addSuffix: true })})
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Sample messages:</p>
                        {error.samples.map((sample, sIdx) => (
                          <pre key={sIdx} className="text-xs font-mono bg-white p-3 rounded border border-red-200 overflow-x-auto whitespace-pre-wrap break-all">
                            {sample}
                          </pre>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No errors found in the selected time window</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Error Timeline</CardTitle>
              <CardDescription>Recent errors in chronological order</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {metrics?.recentErrors && metrics.recentErrors.length > 0 ? (
                  metrics.recentErrors.map((error, idx) => renderLogDetail(error, idx + 1000))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No recent errors</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Status Bar */}
      <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 text-xs flex items-center gap-3 z-50">
        <div className="flex items-center gap-2">
          {isWebSocketConnected ? (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-muted-foreground font-medium">Stream Active</span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-red-400"></div>
              <span className="text-muted-foreground font-medium">Stream Disconnected</span>
            </>
          )}
        </div>
        <div className="h-4 w-px bg-border"></div>
        <span className="text-muted-foreground">
          {realTimeLogs.length > 0 ? `${realTimeLogs.length} new events` : 'Waiting for events...'}
        </span>
        <div className="h-4 w-px bg-border"></div>
        <span className="text-muted-foreground">
           Last fetch: {recentLogsData ? formatDistanceToNow(new Date(), { addSuffix: true }) : 'Never'}
        </span>
      </div>
    </div>
  );
}
