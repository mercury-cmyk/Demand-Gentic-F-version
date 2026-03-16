import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Cloud,
  HardDrive,
  Loader2,
  ArrowLeftRight,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';
import type { Project } from '@/pages/ops-hub';
import MultiCloudPlanner from '@/components/ops/multi-cloud-planner';

/* ── Shared types ── */

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

interface VMStatusResponse {
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

interface CloudRunServiceStatus {
  name: string;
  serviceName: string;
  uri: string;
  status: string;
  createTime: string;
  updateTime: string;
  creator: string;
  lastModifier: string;
}

interface CloudRunRevision {
  name: string;
  imageUrl: string;
  createTime: string;
  status: string;
  trafficPercent?: number;
}

/* ── Helpers ── */

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getServiceBadge(status: string) {
  switch (status) {
    case 'running':
    case 'READY':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'stopped':
    case 'STOPPED':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'missing':
    case 'FAILED':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function getJobBadge(status: DeploymentJob['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'running':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'failed':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

/* ── VM Deployment Panel ── */

function VMDeploymentPanel({ project }: { project: Project }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<VMStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState<string>(
    project.services[0]?.dockerComposeService || 'api',
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await apiJsonRequest<{
          success: boolean;
          status: VMStatusResponse;
          error?: string;
        }>('GET', '/api/ops/deployments/status');
        if (!data.success) throw new Error(data.error || 'Failed to load deployment status');
        setStatus(data.status);
      } catch (error) {
        toast({
          title: 'VM status unavailable',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => fetchStatus(true), 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const runningServices = useMemo(
    () => status?.services.filter((s) => s.status === 'running').length ?? 0,
    [status],
  );

  const activeJobs = useMemo(
    () => status?.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length ?? 0,
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
      if (!data.success) throw new Error(data.error || 'Request failed');
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
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-4 h-4 text-indigo-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</p>
            </div>
            <p className="text-xl font-bold text-slate-800 uppercase">{status?.target || '-'}</p>
            <p className="text-xs text-slate-500 mt-0.5">{status?.mode || 'loading'}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-emerald-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Services</p>
            </div>
            <p className="text-xl font-bold text-slate-800">
              {runningServices}/{status?.services.length ?? 0}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">running</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="w-4 h-4 text-amber-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Jobs</p>
            </div>
            <p className="text-xl font-bold text-slate-800">{activeJobs}</p>
            <p className="text-xs text-amber-600 mt-0.5">active</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent</p>
            </div>
            <Badge className={status?.diagnostics.opsAgentReachable ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
              {status?.diagnostics.opsAgentReachable ? 'Reachable' : 'Local mode'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-slate-800 flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-indigo-500" />
                VM Stack Controls
              </CardTitle>
              <CardDescription className="text-slate-500 mt-1">
                Build images, deploy stack, or restart individual services on the VM.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchStatus(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => queueAction('/api/ops/deployments/build', { service: selectedService })}
                disabled={actionLoading !== null}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Wrench className="w-4 h-4 mr-1.5" />
                Build {selectedService}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => queueAction('/api/ops/deployments/deploy')}
                disabled={actionLoading !== null}
              >
                <Rocket className="w-4 h-4 mr-1.5" />
                Deploy Stack
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => queueAction('/api/ops/deployments/restart', { service: selectedService })}
                disabled={actionLoading !== null || !selectedService}
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Restart {selectedService}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              compose: {status?.composeFilePath || '-'}
            </Badge>
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              deploy: {status?.deployScriptPath || '-'}
            </Badge>
            {status?.diagnostics.dockerAvailable && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                <ShieldCheck className="w-3 h-3 mr-1" />
                Docker ready
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Services Table */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800">Services</CardTitle>
          <CardDescription className="text-slate-500">
            Live container state from Docker Compose on the VM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading services...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">Service</TableHead>
                    <TableHead className="text-slate-600">Container</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-slate-600">Health</TableHead>
                    <TableHead className="text-slate-600">Ports</TableHead>
                    <TableHead className="text-slate-600">Image</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status?.services.map((service) => (
                    <TableRow
                      key={service.serviceName}
                      className={`border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${
                        selectedService === service.serviceName ? 'bg-indigo-50' : ''
                      }`}
                      onClick={() => setSelectedService(service.serviceName)}
                    >
                      <TableCell className="text-slate-800 font-medium">
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4 text-indigo-400" />
                          {service.serviceName}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-sm">
                        {service.containerName || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getServiceBadge(service.status)}>
                          {service.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{service.health || '-'}</TableCell>
                      <TableCell className="text-slate-500 text-sm">{service.ports || '-'}</TableCell>
                      <TableCell className="text-slate-500 text-sm max-w-[260px] truncate">
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

      {/* Job History */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800">Job History</CardTitle>
          <CardDescription className="text-slate-500">
            Recent build, deploy, and restart jobs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!status?.jobs.length ? (
            <div className="py-10 text-center text-slate-400">No deployment jobs recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {status.jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getJobBadge(job.status)}>{job.status}</Badge>
                        <Badge variant="outline" className="border-slate-300 text-slate-600 uppercase">
                          {job.action}
                        </Badge>
                        {job.target && (
                          <Badge variant="outline" className="border-slate-300 text-slate-600">
                            {job.target}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-mono text-slate-600 break-all">{job.command}</p>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1 lg:text-right shrink-0">
                      <div className="inline-flex items-center gap-1">
                        <Clock3 className="w-3.5 h-3.5" />
                        {formatDate(job.startedAt || job.createdAt)}
                      </div>
                      <div>{job.finishedAt ? `Finished ${formatDate(job.finishedAt)}` : 'Still running'}</div>
                    </div>
                  </div>
                  {job.outputSnippet && (
                    <pre className="mt-3 rounded-lg bg-white border border-slate-200 p-3 text-xs text-slate-600 whitespace-pre-wrap overflow-x-auto">
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

/* ── Cloud Run Deployment Panel ── */

function CloudRunDeploymentPanel({ project }: { project: Project }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceStatuses, setServiceStatuses] = useState<CloudRunServiceStatus[]>([]);
  const [selectedService, setSelectedService] = useState<string>(
    project.services[0]?.cloudRunService || '',
  );
  const [revisions, setRevisions] = useState<CloudRunRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Deploy form state
  const [deployImage, setDeployImage] = useState(project.services[0]?.imageUrl || '');
  const [deployServiceName, setDeployServiceName] = useState(project.services[0]?.cloudRunService || '');

  const fetchServiceStatuses = useCallback(async () => {
    setLoading(true);
    const statuses: CloudRunServiceStatus[] = [];

    for (const svc of project.services) {
      if (!svc.cloudRunService) continue;
      try {
        const data = await apiJsonRequest<{
          success: boolean;
          service: CloudRunServiceStatus;
          error?: string;
        }>('GET', `/api/ops/deployments/service/${svc.cloudRunService}?target=cloud-run`);
        if (data.success && data.service) {
          statuses.push({ ...data.service, serviceName: svc.cloudRunService });
        }
      } catch {
        statuses.push({
          name: svc.cloudRunService,
          serviceName: svc.cloudRunService,
          uri: '-',
          status: 'NOT_FOUND',
          createTime: '',
          updateTime: '',
          creator: '',
          lastModifier: '',
        });
      }
    }

    setServiceStatuses(statuses);
    setLoading(false);
  }, [project.services]);

  const fetchRevisions = useCallback(async (serviceName: string) => {
    setRevisionsLoading(true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        revisions: CloudRunRevision[];
        error?: string;
      }>('GET', `/api/ops/deployments/service/${serviceName}/revisions?target=cloud-run`);
      if (data.success) {
        setRevisions(data.revisions || []);
      }
    } catch {
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServiceStatuses();
  }, [fetchServiceStatuses]);

  useEffect(() => {
    if (selectedService) {
      fetchRevisions(selectedService);
    }
  }, [selectedService, fetchRevisions]);

  const deployToCloudRun = async () => {
    if (!deployServiceName || !deployImage) {
      toast({ title: 'Missing fields', description: 'Service name and image URL are required', variant: 'destructive' });
      return;
    }
    setActionLoading('deploy');
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        url?: string;
        message?: string;
        error?: string;
      }>('POST', '/api/ops/deployments/deploy', {
        target: 'cloud-run',
        serviceName: deployServiceName,
        imageUrl: deployImage,
        environment: {},
      });
      if (!data.success) throw new Error(data.error || 'Deploy failed');
      toast({ title: 'Deployed', description: data.message || `Deployed to ${data.url}` });
      fetchServiceStatuses();
      if (selectedService) fetchRevisions(selectedService);
    } catch (error) {
      toast({ title: 'Deploy failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const rollbackService = async (revisionName: string) => {
    if (!selectedService) return;
    setActionLoading('rollback');
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        message?: string;
        error?: string;
      }>('POST', `/api/ops/deployments/service/${selectedService}/rollback`, {
        target: 'cloud-run',
        revisionName,
      });
      if (!data.success) throw new Error(data.error || 'Rollback failed');
      toast({ title: 'Rolled back', description: data.message });
      fetchRevisions(selectedService);
    } catch (error) {
      toast({ title: 'Rollback failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Platform</p>
            </div>
            <p className="text-xl font-bold text-slate-800">Cloud Run</p>
            <p className="text-xs text-blue-600 mt-0.5">GCP Managed</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-emerald-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Services</p>
            </div>
            <p className="text-xl font-bold text-slate-800">{serviceStatuses.length}</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {serviceStatuses.filter((s) => s.status !== 'NOT_FOUND').length} active
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-purple-50 to-white">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-purple-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revisions</p>
            </div>
            <p className="text-xl font-bold text-slate-800">{revisions.length}</p>
            <p className="text-xs text-purple-600 mt-0.5">{selectedService || 'select a service'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Deploy Form */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-800 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-500" />
            Deploy to Cloud Run
          </CardTitle>
          <CardDescription className="text-slate-500 mt-1">
            Deploy a container image to a Cloud Run service with auto-scaling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Service Name</label>
              <Input
                value={deployServiceName}
                onChange={(e) => setDeployServiceName(e.target.value)}
                placeholder="demandgentic-api"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-[2] space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Image URL</label>
              <Input
                value={deployImage}
                onChange={(e) => setDeployImage(e.target.value)}
                placeholder="gcr.io/project/image:tag"
                className="h-9 text-sm font-mono"
              />
            </div>
            <Button
              size="sm"
              onClick={deployToCloudRun}
              disabled={actionLoading !== null || !deployServiceName || !deployImage}
              className="bg-blue-600 hover:bg-blue-700 h-9"
            >
              {actionLoading === 'deploy' ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4 mr-1.5" />
              )}
              Deploy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Services Table */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-slate-800">Cloud Run Services</CardTitle>
              <CardDescription className="text-slate-500">
                Managed services running on Google Cloud Run.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchServiceStatuses} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Cloud Run services...
            </div>
          ) : serviceStatuses.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              No Cloud Run services configured for this project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600">Service</TableHead>
                    <TableHead className="text-slate-600">Status</TableHead>
                    <TableHead className="text-slate-600">URL</TableHead>
                    <TableHead className="text-slate-600">Last Updated</TableHead>
                    <TableHead className="text-slate-600">Last Modifier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceStatuses.map((svc) => (
                    <TableRow
                      key={svc.serviceName}
                      className={`border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${
                        selectedService === svc.serviceName ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedService(svc.serviceName)}
                    >
                      <TableCell className="text-slate-800 font-medium">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-blue-400" />
                          {svc.serviceName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getServiceBadge(svc.status)}>
                          {svc.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {svc.uri && svc.uri !== '-' ? (
                          <a
                            href={svc.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm inline-flex items-center gap-1"
                          >
                            {svc.uri.replace(/^https?:\/\//, '').slice(0, 40)}...
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">{formatDate(svc.updateTime)}</TableCell>
                      <TableCell className="text-slate-500 text-sm">{svc.lastModifier || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revisions & Traffic */}
      {selectedService && (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-800 flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-purple-500" />
                  Revisions & Traffic
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Manage traffic splitting and rollbacks for <span className="font-mono font-medium">{selectedService}</span>.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {revisionsLoading ? (
              <div className="py-8 flex items-center justify-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading revisions...
              </div>
            ) : revisions.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No revisions found.</div>
            ) : (
              <div className="space-y-2">
                {revisions.map((rev) => (
                  <div
                    key={rev.name}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge className={getServiceBadge(rev.status)}>{rev.status}</Badge>
                      <span className="text-sm font-mono text-slate-700 truncate">{rev.name}</span>
                      {rev.trafficPercent !== undefined && rev.trafficPercent > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                          {rev.trafficPercent}% traffic
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">{formatDate(rev.createTime)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rollbackService(rev.name)}
                        disabled={actionLoading !== null || (rev.trafficPercent === 100)}
                        className="h-7 text-xs"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Rollback
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Main DeploymentsTab ── */

interface DeploymentsTabProps {
  project: Project;
}

export default function DeploymentsTab({ project }: DeploymentsTabProps) {
  const isCloudRun = project.deployTarget === 'cloud-run';

  return (
    <div className="space-y-4">
      <MultiCloudPlanner project={project} />

      {/* Target indicator */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
          isCloudRun
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-indigo-50 border-indigo-200 text-indigo-700'
        }`}>
          {isCloudRun ? <Cloud className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
          <span className="text-sm font-semibold">
            {isCloudRun ? 'Cloud Run' : 'VM / Docker Compose'}
          </span>
        </div>
        <span className="text-sm text-slate-500">
          {project.name} — {project.services.length} service{project.services.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isCloudRun ? (
        <CloudRunDeploymentPanel project={project} />
      ) : (
        <VMDeploymentPanel project={project} />
      )}
    </div>
  );
}
