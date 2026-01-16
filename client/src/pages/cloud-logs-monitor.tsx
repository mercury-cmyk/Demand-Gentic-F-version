import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Activity, TrendingUp, Search, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource?: string;
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
  const [timeWindow, setTimeWindow] = useState<24 | 48 | 168>(24); // hours
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch recent logs
  const { data: recentLogs, refetch: refetchRecent } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/recent', { minutes: 5 }],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/cloud-logs/recent?minutes=5');
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 30000 : false, // 30 seconds
  });

  // Fetch metrics
  const { data: metrics, refetch: refetchMetrics } = useQuery<LogMetrics>({
    queryKey: ['/api/cloud-logs/metrics', { hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/metrics?hours=${timeWindow}`);
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 60000 : false, // 1 minute
  });

  // Fetch error summary
  const { data: errorSummary, refetch: refetchErrors } = useQuery<{ errors: ErrorSummary[]; totalTypes: number; totalErrors: number }>({
    queryKey: ['/api/cloud-logs/errors', { hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/errors?hours=${timeWindow}`);
      return await (response as any).json();
    },
    refetchInterval: autoRefresh ? 60000 : false,
  });

  // Search logs
  const { data: searchResults, refetch: refetchSearch } = useQuery<{ logs: LogEntry[]; count: number }>({
    queryKey: ['/api/cloud-logs/search', { q: searchQuery, hours: timeWindow }],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/cloud-logs/search?q=${encodeURIComponent(searchQuery)}&hours=${timeWindow}`);
      return await (response as any).json();
    },
    enabled: searchQuery.length > 2,
  });

  const handleRefreshAll = () => {
    refetchRecent();
    refetchMetrics();
    refetchErrors();
    if (searchQuery.length > 2) refetchSearch();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'ERROR': return 'destructive';
      case 'WARNING': return 'default';
      case 'INFO': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'ERROR': return <AlertCircle className="h-4 w-4" />;
      case 'WARNING': return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
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
              className="border rounded px-3 py-1"
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
            <Clock className="h-4 w-4 mr-2" />
            Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={handleRefreshAll} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
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
            <div className="text-2xl font-bold">{metrics?.totalLogs || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics?.errorCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              {errorSummary?.totalTypes || 0} distinct types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{metrics?.warningCount || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Info Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{metrics?.infoCount || 0}</div>
            <p className="text-xs text-muted-foreground">Last {timeWindow}h</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Logs</CardTitle>
          <CardDescription>Search cloud logs by text (minimum 3 characters)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {searchResults && searchResults.count > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">{searchResults.count} results found</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults?.logs?.map((log: LogEntry, idx: number) => (
                  <div key={idx} className="p-3 border rounded text-sm">
                    <div className="flex items-start gap-2">
                      <Badge variant={getSeverityColor(log.severity) as any}>
                        {log.severity}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-mono text-xs break-all">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recent">Recent Logs</TabsTrigger>
          <TabsTrigger value="errors">Error Analysis</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Recent Logs Tab */}
        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Logs (Last 5 Minutes)</CardTitle>
              <CardDescription>Real-time log stream from Cloud Run</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentLogs?.logs?.map((log: LogEntry, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded hover:bg-accent">
                    {getSeverityIcon(log.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getSeverityColor(log.severity) as any} className="text-xs">
                          {log.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="font-mono text-xs break-all">{log.message}</p>
                    </div>
                  </div>
                )) || <p className="text-muted-foreground text-center py-8">No recent logs</p>}
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
              <div className="space-y-3">
                {errorSummary?.errors?.map((error: ErrorSummary, idx: number) => (
                  <div key={idx} className="border rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        {error.errorType}
                      </h3>
                      <div className="flex items-center gap-3">
                        <Badge variant="destructive">{error.count} occurrences</Badge>
                        <span className="text-xs text-muted-foreground">
                          Last: {formatDistanceToNow(new Date(error.lastOccurrence), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 mt-3">
                      <p className="text-xs font-medium text-muted-foreground">Sample messages:</p>
                      {error.samples.map((sample: string, sIdx: number) => (
                        <p key={sIdx} className="text-xs font-mono bg-muted p-2 rounded break-all">
                          {sample}
                        </p>
                      ))}
                    </div>
                  </div>
                )) || <p className="text-muted-foreground text-center py-8">No errors found</p>}
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {metrics?.recentErrors?.map((error: LogEntry, idx: number) => (
                  <div key={idx} className="flex gap-3 p-3 border-l-4 border-red-500 bg-red-50 rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive" className="text-xs">ERROR</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(error.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-mono text-xs break-all">{error.message}</p>
                    </div>
                  </div>
                )) || <p className="text-muted-foreground text-center py-8">No recent errors</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
