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
  labels?: Record;
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

const VM_SERVICES = [
  { value: 'api', label: 'API Server' },
  { value: 'media-bridge', label: 'Media Bridge' },
  { value: 'drachtio', label: 'Drachtio SIP' },
  { value: 'ops-agent', label: 'Ops Agent' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'all', label: 'All Services' },
] as const;

export default function CloudLogsMonitor() {
  const isDevMode = import.meta.env.DEV;
  const [searchQuery, setSearchQuery] = useState("");
  const [timeWindow, setTimeWindow] = useState(24);
  const [selectedService, setSelectedService] = useState("api");
  const [autoRefresh, setAutoRefresh] = useState(!isDevMode);
  const [selectedSeverity, setSelectedSeverity] = useState(['ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEFAULT']);
  const [expandedLog, setExpandedLog] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [realTimeLogs, setRealTimeLogs] = useState([]);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [terminalMode, setTerminalMode] = useState(true);
  const [showActivityFeed, setShowActivityFeed] = useState(true);
  const [activityEvents, setActivityEvents] = useState([]);
  const [liveStats, setLiveStats] = useState({
    logsPerSecond: 0,
    errorsLast5Min: 0,
    warningsLast5Min: 0,
    connectionUptime: 0
  });
  const [newLogHighlight, setNewLogHighlight] = useState>(new Set());

  const logScrollContainerRef = useRef(null);
  const wsRef = useRef(null);
  const connectionStartRef = useRef(null);
  const logCountRef = useRef({ total: 0, lastCheck: Date.now() });
  const canAutoPoll = autoRefresh;

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
    const wsUrl = `${protocol}//${host}/log-stream?service=${encodeURIComponent(selectedService)}`;

    // Clear real-time logs when service changes to avoid mixing
    setRealTimeLogs([]);

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
  }, [autoRefresh, addActivityEvent, selectedService]);

  // Fetch recent logs (Historical)
  const { data: recentLogsData, refetch: refetchRecent } = useQuery({
    queryKey: ['/api/cloud-logs/recent', { minutes: 5, service: selectedService }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/recent?minutes=5&limit=100&service=${selectedService}`);
      return await (response as any).json();
    },
    refetchInterval: !isWebSocketConnected && canAutoPoll ? 30000 : false,
    enabled: canAutoPoll,
  });

  // Merge recent logs with real-time logs
  const allLogs = useMemo(() => {
    const historical = recentLogsData?.logs || [];
    if (realTimeLogs.length === 0) return historical;

    const firstRealTime = new Date(realTimeLogs[0].timestamp).getTime();
    const filteredHistorical = historical.filter(l => new Date(l.timestamp).getTime() 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [recentLogsData, realTimeLogs]);

  // Fetch metrics
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['/api/cloud-logs/metrics', { hours: timeWindow, service: selectedService }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/metrics?hours=${timeWindow}&service=${selectedService}`);
      return await (response as any).json();
    },
    refetchInterval: canAutoPoll ? 60000 : false,
    enabled: canAutoPoll,
  });

  // Fetch error summary
  const { data: errorSummary, refetch: refetchErrors } = useQuery({
    queryKey: ['/api/cloud-logs/errors', { hours: timeWindow, service: selectedService }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/errors?hours=${timeWindow}&service=${selectedService}`);
      return await (response as any).json();
    },
    refetchInterval: canAutoPoll ? 60000 : false,
    enabled: canAutoPoll,
  });

  // Search logs
  const { data: searchResults, refetch: refetchSearch } = useQuery({
    queryKey: ['/api/cloud-logs/search', { q: searchQuery, hours: timeWindow, service: selectedService }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/search?q=${encodeURIComponent(searchQuery)}&hours=${timeWindow}&limit=200&service=${selectedService}`);
      return await (response as any).json();
    },
    enabled: canAutoPoll && searchQuery.length > 2,
  });

  // Auto-scroll (scoped to the log scroll container, not the whole page)
  useEffect(() => {
    if (autoScroll && logScrollContainerRef.current) {
      const container = logScrollContainerRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (container) {
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight;
        });
      }
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
        return ;
      case 'WARNING':
        return ;
      case 'INFO':
        return ;
      default:
        return ;
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
    if (seconds  {
    const isExpanded = expandedLog === index;
    const isNew = newLogHighlight.has(index);

    if (terminalMode) {
      return (
         setExpandedLog(isExpanded ? null : index)}
        >
          
             {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
          
          
            {log.severity || 'LOG'}
          
          
            {log.message}
            {isExpanded && log.jsonPayload && (
               
                 {JSON.stringify(log.jsonPayload, null, 2)}
               
            )}
            {isExpanded && log.labels && (
              
                 {Object.entries(log.labels).map(([k,v]) => (
                   {k}={v}
                 ))}
              
            )}
          
        
      );
    }

    return (
      
         setExpandedLog(isExpanded ? null : index)}
        >
          {isExpanded ? (
            
          ) : (
            
          )}

          {getSeverityIcon(log.severity)}

          
            
              
                {log.severity || 'LOG'}
              
              
                {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss.SSS')}
              
              
                ({formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })})
              
              {log.resource && (
                
                  {log.resource}
                
              )}
            
            
              {log.message}
            
          
        

        {isExpanded && (
          
            
              Message:
              
                {log.message}
              
            

            {log.labels && Object.keys(log.labels).length > 0 && (
              
                Labels:
                
                  {Object.entries(log.labels).map(([key, value]) => (
                    
                      {key}:
                      {value}
                    
                  ))}
                
              
            )}

            {log.jsonPayload && (
              
                JSON Payload:
                
                  {JSON.stringify(log.jsonPayload, null, 2)}
                
              
            )}
          
        )}
      
    );
  };

  const renderActivityEvent = (event: ActivityEvent) => {
    const getEventIcon = () => {
      switch (event.type) {
        case 'error': return ;
        case 'warning': return ;
        case 'connection': return ;
        default: return ;
      }
    };

    return (
      
        {getEventIcon()}
        
          {event.message}
          {format(event.timestamp, 'HH:mm:ss')}
        
      
    );
  };

  return (
    
      {/* Animated background grid */}
      

      
        {/* Header with live status */}
        
          
            
              
              
                {isWebSocketConnected ? (
                  
                ) : (
                  
                )}
              
            
            
              
                System Logs
                
                  {isWebSocketConnected ? 'LIVE' : 'OFFLINE'}
                
              
              
                
                  
                  {VM_SERVICES.find(s => s.value === selectedService)?.label || selectedService}
                
                {isWebSocketConnected && (
                  
                    
                    Uptime: {formatUptime(liveStats.connectionUptime)}
                  
                )}
              
            
          

          
            
              
              
                
                Terminal
              
            

            
              
              
                {showActivityFeed ?  : }
                Activity
              
            

             setSelectedService(e.target.value)}
              className="border border-slate-700 rounded-xl px-4 py-2 text-sm bg-slate-800/50 text-slate-300 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            >
              {VM_SERVICES.map(s => (
                {s.label}
              ))}
            

             setTimeWindow(parseInt(e.target.value) as any)}
              className="border border-slate-700 rounded-xl px-4 py-2 text-sm bg-slate-800/50 text-slate-300 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
            >
              Last 24 hours
              Last 48 hours
              Last 7 days
            

             setAutoRefresh(!autoRefresh)}
              className={`border-slate-700 ${autoRefresh ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800/50 text-slate-400'}`}
            >
              {autoRefresh ?  : }
              {autoRefresh ? 'Streaming' : 'Paused'}
            

            
              
              Refresh
            

            
              
              Export
            
          
        

        {/* Live Stats Bar */}
        
          {[
            { icon: Zap, label: 'Logs/sec', value: liveStats.logsPerSecond.toFixed(1), color: 'cyan', pulse: liveStats.logsPerSecond > 0 },
            { icon: Activity, label: 'Total Logs', value: filteredLogs.length.toLocaleString(), color: 'emerald' },
            { icon: AlertCircle, label: 'Errors (5m)', value: liveStats.errorsLast5Min, color: 'red', pulse: liveStats.errorsLast5Min > 0 },
            { icon: AlertTriangle, label: 'Warnings (5m)', value: liveStats.warningsLast5Min, color: 'amber', pulse: liveStats.warningsLast5Min > 0 },
            { icon: Database, label: 'Total (24h)', value: (metrics?.totalLogs || 0).toLocaleString(), color: 'purple' },
            { icon: Shield, label: 'Error Rate', value: metrics?.totalLogs ? `${((metrics.errorCount / metrics.totalLogs) * 100).toFixed(2)}%` : '0%', color: 'orange' },
          ].map((stat, idx) => (
            
              
              {stat.pulse && }
              
                
                  
                    
                  
                  
                    {stat.label}
                    {stat.value}
                  
                
              
            
          ))}
        

        {/* Main Content Area */}
        
          {/* Main Logs Panel */}
          
            {/* Search and Filters */}
            
              
                
                  
                    
                      
                      Search & Filter
                    
                    Filter logs by severity and search content
                  
                   setShowFilters(!showFilters)}
                    className="border-slate-700 bg-slate-800/50 text-slate-300"
                  >
                    
                    {showFilters ? 'Hide' : 'Show'} Filters
                  
                
              
              
                
                  
                    
                     setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500/50"
                    />
                  
                  {searchQuery && (
                     setSearchQuery('')}
                      className="text-slate-400 hover:text-white"
                    >
                      
                    
                  )}
                

                {showFilters && (
                  
                    Severity Levels:
                    
                      {['ERROR', 'WARNING', 'INFO', 'DEBUG', 'DEFAULT'].map(severity => (
                         toggleSeverityFilter(severity)}
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
                          {severity}
                        
                      ))}
                    
                  
                )}
              
            

            {/* Live Log Stream */}
            
              
                
                  
                    
                      {terminalMode ? (
                        <>
                          
                          ~/logs/cloud-run
                        
                      ) : (
                        <>
                          
                          Live Log Stream
                        
                      )}
                    
                    
                      {filteredLogs.length} logs • {isWebSocketConnected ? 'Real-time streaming' : 'Polling mode'}
                    
                  
                  
                     setAutoScroll(!autoScroll)}
                      className={`${terminalMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'border-slate-700 bg-slate-800/50 text-slate-300'}`}
                    >
                      
                      Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                    
                  
                
              
              
                
                  
                    {filteredLogs.length > 0 ? (
                      <>
                        {filteredLogs.map((log, idx) => renderLogDetail(log, idx))}
                      
                    ) : (
                      
                        
                          
                          {isWebSocketConnected && (
                            
                              
                            
                          )}
                        
                        
                          {isWebSocketConnected ? 'Waiting for incoming logs...' : 'No logs matching current filters'}
                        
                        {!isWebSocketConnected && (
                          
                            WebSocket disconnected. Attempting to reconnect...
                          
                        )}
                      
                    )}
                  
                
              
            

            {/* Error Analysis Tabs */}
            
              
                
                  
                  Error Analysis
                
                
                  
                  Error Timeline
                
              

              
                
                  
                    
                      
                      Error Analysis
                    
                    Grouped errors with occurrence counts
                  
                  
                    
                      
                        {errorSummary?.errors && errorSummary.errors.length > 0 ? (
                          errorSummary.errors.map((error, idx) => (
                            
                              
                                
                                  
                                  {error.errorType}
                                
                                
                                  {error.count}x
                                
                              
                              
                                Last seen: {format(new Date(error.lastOccurrence), 'MMM dd, HH:mm:ss')}
                              
                              {error.samples.slice(0, 2).map((sample, sIdx) => (
                                
                                  {sample}
                                
                              ))}
                            
                          ))
                        ) : (
                          
                            
                            No errors in the selected time window
                          
                        )}
                      
                    
                  
                
              

              
                
                  
                    
                      
                      Error Timeline
                    
                    Recent errors in chronological order
                  
                  
                    
                      
                        {metrics?.recentErrors && metrics.recentErrors.length > 0 ? (
                          metrics.recentErrors.map((error, idx) => renderLogDetail(error, idx + 1000))
                        ) : (
                          
                            
                            No recent errors
                          
                        )}
                      
                    
                  
                
              
            
          

          {/* Activity Feed Sidebar */}
          {showActivityFeed && (
            
              
                
                  
                    
                    Live Activity Feed
                  
                
                
                  
                    
                      {activityEvents.length > 0 ? (
                        activityEvents.map(renderActivityEvent)
                      ) : (
                        
                          
                          Waiting for activity...
                        
                      )}
                    
                  
                
              

              {/* Quick Stats */}
              
                
                  
                    
                    Quick Stats
                  
                
                
                  
                    Real-time logs
                    {realTimeLogs.length}
                  
                  
                    Connection
                    
                      {isWebSocketConnected ? 'Active' : 'Disconnected'}
                    
                  
                  
                    Filters active
                    {selectedSeverity.length}/5
                  
                  
                    Time window
                    {timeWindow}h
                  
                
              
            
          )}
        

        {/* Floating Status Indicator */}
        
          
            
              
              
                {isWebSocketConnected ? 'Live Stream Active' : 'Reconnecting...'}
              
            
            
            
              {filteredLogs.length} logs
            
            {isWebSocketConnected && liveStats.logsPerSecond > 0 && (
              <>
                
                
                  
                  {liveStats.logsPerSecond}/s
                
              
            )}
          
        
      
    
  );
}