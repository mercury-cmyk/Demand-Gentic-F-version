import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Pause
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
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch recent logs
  const { data: recentLogs, refetch: refetchRecent } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/recent', { minutes: 5 }],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/cloud-logs/recent?minutes=5&limit=100');
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 10000 : false, // 10 seconds for faster updates
  });

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
  }, [recentLogs, autoScroll]);

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

  const filteredLogs = recentLogs?.logs?.filter(log =>
    selectedSeverity.includes(log.severity?.toUpperCase())
  ) || [];

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
          <p className="text-muted-foreground">Monitor Google Cloud Run application logs in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Time Window:</label>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(parseInt(e.target.value) as any)}
              className="border rounded px-3 py-1 text-sm"
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Live Log Stream</CardTitle>
                  <CardDescription>
                    Real-time logs (last 5 minutes) • {filteredLogs.length} logs shown
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutoScroll(!autoScroll)}
                  >
                    Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
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
      <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 text-xs flex items-center gap-3">
        <div className="flex items-center gap-2">
          {autoRefresh ? (
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
          ) : (
            <div className="h-2 w-2 rounded-full bg-gray-400"></div>
          )}
          <span className="text-muted-foreground">
            {autoRefresh ? 'Live' : 'Paused'}
          </span>
        </div>
        <div className="h-4 w-px bg-border"></div>
        <span className="text-muted-foreground">
          Last updated: {recentLogs ? formatDistanceToNow(new Date(), { addSuffix: true }) : 'Never'}
        </span>
      </div>
    </div>
  );
}
