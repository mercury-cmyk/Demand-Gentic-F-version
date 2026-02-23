import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Download, Phone } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  service: string;
  metadata?: Record<string, any>;
}

export default function ProdLogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [severity, setSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [criticalErrors, setCriticalErrors] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    try {
      const mockLogs: LogEntry[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 120000),
          level: 'INFO',
          message: 'Production server started',
          service: 'api-prod',
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 90000),
          level: 'INFO',
          message: 'Cloud Run service deployed',
          service: 'cloud-run',
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 60000),
          level: 'INFO',
          message: '1,234 API requests processed',
          service: 'api-prod',
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 30000),
          level: 'WARNING',
          message: 'Database connection pool at 85% capacity',
          service: 'db-prod',
          metadata: { pool_size: 85 },
        },
        {
          id: '5',
          timestamp: new Date(),
          level: 'INFO',
          message: 'Scheduled backup completed successfully',
          service: 'backup-service',
        },
      ];
      setLogs(mockLogs);
      setCriticalErrors(mockLogs.filter((log) => log.level === 'CRITICAL' || log.level === 'ERROR'));
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const levelMatch = severity === 'ALL' || log.level === severity;
    const searchMatch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.service.toLowerCase().includes(searchQuery.toLowerCase());
    return levelMatch && searchMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'DEBUG':
        return 'bg-gray-500/20 text-gray-400';
      case 'INFO':
        return 'bg-blue-500/20 text-blue-400';
      case 'WARNING':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'ERROR':
        return 'bg-orange-500/20 text-orange-400';
      case 'CRITICAL':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const exportLogs = () => {
    const csv = filteredLogs
      .map(
        (log) =>
          `${log.timestamp.toISOString()},${log.level},${log.service},"${log.message.replace(/"/g, '""')}"`,
      )
      .join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`);
    element.setAttribute('download', `prod-logs-${Date.now()}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-4">
      {/* Critical Alert */}
      {criticalErrors.length > 0 && (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {criticalErrors.length} critical error(s) detected in production. Immediate action required.
            <Button variant="outline" size="sm" className="ml-4">
              <Phone className="w-4 h-4 mr-2" />
              Page On-Call
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2 flex-1">
              <Input
                placeholder="Search production logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-200 flex-1"
              />
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-[150px] bg-slate-700 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="ALL">All Levels</SelectItem>
                  <SelectItem value="DEBUG">Debug</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className={autoScroll ? 'bg-green-500/20' : ''}
              >
                {autoScroll ? '🔵' : '⚫'} Auto-scroll
              </Button>
              <Button variant="outline" size="sm" onClick={exportLogs}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Display */}
      <Card className="bg-slate-800 border-slate-700 h-[600px] overflow-hidden flex flex-col">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="text-lg">⚙️ Production Logs</CardTitle>
          <CardDescription>Real-time logs from production environment</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto pt-4 font-mono text-sm">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No logs found</div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-3 text-xs hover:bg-slate-700/50 p-2 rounded">
                  <span className="text-slate-500 flex-shrink-0 w-24">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <Badge className={`flex-shrink-0 ${getLevelColor(log.level)}`}>
                    {log.level}
                  </Badge>
                  <span className="text-slate-400 flex-shrink-0 w-20">{log.service}</span>
                  <span className="text-slate-200 flex-1 break-words">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
