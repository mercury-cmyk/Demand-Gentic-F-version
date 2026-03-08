import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Server,
  RefreshCw,
  Rocket,
  Wrench,
  RotateCcw,
  ShieldCheck,
  Clock3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';

interface DeploymentService {
  serviceName: string;
  containerName: string | null;
  status: 'running' | 'stopped' | 'missing' | 'unknown';
  health: string | null;
  image: string | null;
  ports: string | null;
  source: 'docker' | 'compose';
}

interface DeploymentJob {
  id: string;
  action: 'build' | 'deploy' | 'restart';
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  command: string;
  target?: string;
  outputSnippet?: string;
  exitCode?: number | null;
}

interface DeploymentStatusResponse {
  target: 'local' | 'vm';
  mode: 'local' | 'ops-agent';
  composeFilePath: string;
  deployScriptPath: string;
  diagnostics: {
    dockerAvailable: boolean;
    composeAvailable: boolean;
    deployScriptAvailable: boolean;
    opsAgentReachable: boolean;
  };
  services: DeploymentService[];
  jobs: DeploymentJob[];
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getServiceBadge(status: DeploymentService['status']) {
  switch (status) {
    case 'running':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'stopped':
      return 'bg-amber-500/20 text-amber-300';
    case 'missing':
      return 'bg-red-500/20 text-red-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

function getJobBadge(status: DeploymentJob['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'running':
      return 'bg-cyan-500/20 text-cyan-300';
    case 'failed':
      return 'bg-red-500/20 text-red-300';
    default:
      return 'bg-slate-500/20 text-slate-300';
  }
}

export default function DeploymentsTab() {
  const { toast } = useToast();
  const [status, setStatus] = useState<DeploymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('api');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await apiJsonRequest<{
        success: boolean;
        status: DeploymentStatusResponse;
        error?: string;
      }>('GET', '/api/ops/deployments/status');
      if (!data.success) {
        throw new Error(data.error || 'Failed to load deployment status');
      }
      setStatus(data.status);
    } catch (error) {
      toast({
        title: 'Deployment status unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const runningServices = useMemo(
    () => status?.services.filter((service) => service.status === 'running').length ?? 0,
    [status],
  );

  const activeJobs = useMemo(
    () => status?.jobs.filter((job) => job.status === 'running' || job.status === 'queued').length ?? 0,
    [status],
  );

  const queueAction = async (path: string, body?: Record<string, unknown>) => {
    setActionLoading(path);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        message?: string;
        job?: { action?: string };
        error?: string;
      }>('POST', path, body || {});
      if (!data.success) {
        throw new Error(data.error || 'Request failed');
      }

      toast({
        title: 'Action queued',
        description: data.message || `${data.job?.action || 'Operation'} started`,
      });
      fetchStatus(true);
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Deployment Target</p>
            <p className="text-2xl font-bold text-white uppercase">{status?.target || '-'}</p>
            <p className="text-xs text-slate-500 mt-1">{status?.mode || 'loading'}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Running Services</p>
            <p className="text-2xl font-bold text-white">
              {runningServices}/{status?.services.length ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Queued Jobs</p>
            <p className="text-2xl font-bold text-white">{activeJobs}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Ops Agent</p>
            <Badge className={status?.diagnostics.opsAgentReachable ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}>
              {status?.diagnostics.opsAgentReachable ? 'Reachable' : 'Local mode'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-white">VM Stack Controls</CardTitle>
              <CardDescription className="text-slate-400">
                Build the API image, queue a VM deploy, or restart a single service.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-slate-600"
                onClick={() => fetchStatus(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={() => queueAction('/api/ops/deployments/build', { service: 'api' })}
                disabled={actionLoading !== null}
              >
                <Wrench className="w-4 h-4 mr-2" />
                Build API
              </Button>
              <Button
                variant="secondary"
                onClick={() => queueAction('/api/ops/deployments/deploy')}
                disabled={actionLoading !== null}
              >
                <Rocket className="w-4 h-4 mr-2" />
                Deploy Stack
              </Button>
              <Button
                variant="outline"
                className="border-slate-600"
                onClick={() => queueAction('/api/ops/deployments/restart', { service: selectedService })}
                disabled={actionLoading !== null || !selectedService}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restart {selectedService}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              compose: {status?.composeFilePath || '-'}
            </Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              deploy: {status?.deployScriptPath || '-'}
            </Badge>
            {status?.diagnostics.dockerAvailable && (
              <Badge className="bg-emerald-500/20 text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                Docker ready
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Services</CardTitle>
          <CardDescription className="text-slate-400">
            Live service state from the VM deployment stack.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-slate-400">Loading services...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-300">Service</TableHead>
                    <TableHead className="text-slate-300">Container</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-slate-300">Health</TableHead>
                    <TableHead className="text-slate-300">Ports</TableHead>
                    <TableHead className="text-slate-300">Image</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status?.services.map((service) => (
                    <TableRow
                      key={service.serviceName}
                      className={`border-slate-700 hover:bg-slate-700/40 cursor-pointer ${
                        selectedService === service.serviceName ? 'bg-cyan-500/10' : ''
                      }`}
                      onClick={() => setSelectedService(service.serviceName)}
                    >
                      <TableCell className="text-white font-medium">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-cyan-300" />
                          {service.serviceName}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300 font-mono text-sm">
                        {service.containerName || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getServiceBadge(service.status)}>
                          {service.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{service.health || '-'}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{service.ports || '-'}</TableCell>
                      <TableCell className="text-slate-400 text-sm max-w-[260px] truncate">
                        {service.image || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Job History</CardTitle>
          <CardDescription className="text-slate-400">
            Recent build, deploy, and restart jobs tracked by Ops Hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!status?.jobs.length ? (
            <div className="py-10 text-center text-slate-400">No deployment jobs recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {status.jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getJobBadge(job.status)}>{job.status}</Badge>
                        <Badge variant="outline" className="border-slate-600 text-slate-300 uppercase">
                          {job.action}
                        </Badge>
                        {job.target && (
                          <Badge variant="outline" className="border-slate-600 text-slate-300">
                            {job.target}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-mono text-slate-300 break-all">{job.command}</p>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 lg:text-right">
                      <div className="inline-flex items-center gap-1">
                        <Clock3 className="w-3.5 h-3.5" />
                        {formatDate(job.startedAt || job.createdAt)}
                      </div>
                      <div>{job.finishedAt ? `Finished ${formatDate(job.finishedAt)}` : 'Still running'}</div>
                    </div>
                  </div>
                  {job.outputSnippet && (
                    <pre className="mt-3 rounded-lg bg-slate-950 p-3 text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto">
                      {job.outputSnippet}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
