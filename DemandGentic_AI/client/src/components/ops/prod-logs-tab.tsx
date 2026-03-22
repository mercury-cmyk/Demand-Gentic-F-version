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
  metadata?: Record;
}

export default function ProdLogsTab() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [severity, setSeverity] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [criticalErrors, setCriticalErrors] = useState([]);
  const logsEndRef = useRef(null);

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
    
      {/* Critical Alert */}
      {criticalErrors.length > 0 && (
        
          
          
            {criticalErrors.length} critical error(s) detected in production. Immediate action required.
            
              
              Page On-Call
            
          
        
      )}

      {/* Controls */}
      
        
          
            
               setSearchQuery(e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-200 flex-1"
              />
              
                
                  
                
                
                  All Levels
                  Debug
                  Info
                  Warning
                  Error
                  Critical
                
              
            
            
               setAutoScroll(!autoScroll)}
                className={autoScroll ? 'bg-green-500/20' : ''}
              >
                {autoScroll ? '🔵' : '⚫'} Auto-scroll
              
              
                
                Export
              
            
          
        
      

      {/* Logs Display */}
      
        
          ⚙️ Production Logs
          Real-time logs from production environment
        
        
          {isLoading ? (
            Loading logs...
          ) : filteredLogs.length === 0 ? (
            No logs found
          ) : (
            
              {filteredLogs.map((log) => (
                
                  
                    {log.timestamp.toLocaleTimeString()}
                  
                  
                    {log.level}
                  
                  {log.service}
                  {log.message}
                
              ))}
              
            
          )}
        
      
    
  );
}